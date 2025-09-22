import type { Pool } from "pg";
import type {
  UniverseRepository,
  UniverseSnapshotAggregate,
} from "./server";
import type {
  UniverseConstituentRecord,
  UniverseSnapshotRecord,
} from "./snapshot";

export interface CreateUniverseRepositoryDeps {
  pool: Pick<Pool, "connect"> & {
    query: Pool["query"];
  };
}

export interface UniversePersistence extends UniverseRepository {
  saveSnapshot(
    snapshot: UniverseSnapshotRecord,
    constituents: UniverseConstituentRecord[],
  ): Promise<void>;
}

interface SnapshotRow {
  snapshot_id: string;
  tenant_id: string;
  as_of_date: string;
  effective_at: string;
  published_at: string;
  source: "spdj" | "manual_override";
  hash: string;
  status: "active" | "superseded";
}

interface ConstituentRow {
  constituent_id: string;
  snapshot_id: string;
  tenant_id: string;
  position: number;
  ticker: string;
  cusip: string | null;
  isin: string | null;
  free_float_market_cap: number;
  weight: number;
  sector: string | null;
  currency: string;
}

export function createUniverseRepository({ pool }: CreateUniverseRepositoryDeps): UniversePersistence {
  async function saveSnapshot(
    snapshot: UniverseSnapshotRecord,
    constituents: UniverseConstituentRecord[],
  ): Promise<void> {
    validateConstituents(constituents);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ius.universe_snapshots (
           snapshot_id, tenant_id, as_of_date, effective_at, published_at, source, hash, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          snapshot.snapshot_id,
          snapshot.tenant_id,
          snapshot.as_of_date,
          snapshot.effective_at,
          snapshot.published_at,
          snapshot.source,
          snapshot.hash,
          snapshot.status,
        ],
      );

      const insertText = `INSERT INTO ius.universe_constituents (
        constituent_id, snapshot_id, tenant_id, position, ticker, cusip, isin,
        free_float_market_cap, weight, sector, currency
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;

      for (const row of constituents) {
        await client.query(insertText, [
          row.constituent_id,
          snapshot.snapshot_id,
          snapshot.tenant_id,
          row.position,
          row.ticker,
          row.cusip ?? null,
          row.isin ?? null,
          row.free_float_market_cap,
          row.weight,
          row.sector ?? null,
          row.currency,
        ]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function getLatestSnapshot(
    tenantId: string,
    asOf?: string,
  ): Promise<UniverseSnapshotAggregate | null> {
    const snapshotResult = await pool.query<SnapshotRow>(
      `SELECT * FROM ius.universe_snapshots
       WHERE tenant_id = $1
         AND ($2::date IS NULL OR as_of_date <= $2::date)
       ORDER BY as_of_date DESC, effective_at DESC, snapshot_id DESC
       LIMIT 1`,
      [tenantId, asOf ?? null],
    );

    const snapshotRow = snapshotResult.rows[0];
    if (!snapshotRow) {
      return null;
    }

    const constituents = await fetchConstituents([snapshotRow.snapshot_id]);
    return mapSnapshotAggregate(snapshotRow, constituents);
  }

  async function listSnapshots(
    tenantId: string,
    options: { startDate?: string; endDate?: string; limit?: number; cursor?: string },
  ) {
    const limit = options.limit ?? 25;

    let cursorFilter = "";
    const params: Array<string | number | null> = [tenantId];
    let paramIndex = params.length;

    if (options.startDate) {
      params.push(options.startDate);
      paramIndex += 1;
    }
    const startIdx = options.startDate ? paramIndex : 0;

    if (options.endDate) {
      params.push(options.endDate);
    }
    const endIdx = options.endDate ? params.length : 0;

    let cursorParams: [string, string] | null = null;
    if (options.cursor) {
      const cursorResult = await pool.query<SnapshotRow>(
        `SELECT as_of_date, effective_at FROM ius.universe_snapshots WHERE snapshot_id = $1 AND tenant_id = $2`,
        [options.cursor, tenantId],
      );
      const cursorRow = cursorResult.rows[0];
      if (cursorRow) {
        cursorFilter = `AND (as_of_date, effective_at, snapshot_id) < ($${params.length + 1}, $${params.length + 2}, $${params.length + 3})`;
        cursorParams = [cursorRow.as_of_date, cursorRow.effective_at];
      }
    }

    const filters: string[] = ["tenant_id = $1"];
    if (options.startDate) {
      filters.push(`as_of_date >= $${startIdx}`);
    }
    if (options.endDate) {
      filters.push(`as_of_date <= $${endIdx}`);
    }

    let snapshotQuery = `SELECT * FROM ius.universe_snapshots WHERE ${filters.join(" AND ")}`;

    const queryParams: Array<string | number | null> = [...params];
    if (cursorParams) {
      queryParams.push(cursorParams[0], cursorParams[1], options.cursor!);
    }

    snapshotQuery += ` ${cursorFilter} ORDER BY as_of_date DESC, effective_at DESC, snapshot_id DESC LIMIT ${limit}`;

    const snapshotResult = await pool.query<SnapshotRow>(snapshotQuery, queryParams);
    const snapshotRows = snapshotResult.rows;

    if (snapshotRows.length === 0) {
      return { items: [], nextCursor: null, totalCount: 0 };
    }

    const aggregateMap = await fetchConstituentMap(snapshotRows.map((row) => row.snapshot_id));

    const items = snapshotRows.map((row: SnapshotRow) =>
      mapSnapshotAggregate(row, aggregateMap.get(row.snapshot_id) ?? []),
    );

    const nextCursor = snapshotRows.length === limit ? snapshotRows[snapshotRows.length - 1].snapshot_id : null;

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM ius.universe_snapshots WHERE ${filters.join(" AND ")}`,
      params,
    );

    return {
      items,
      nextCursor,
      totalCount: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  async function fetchConstituents(snapshotIds: string[]) {
    return fetchConstituentMap(snapshotIds).then((map: Map<string, ConstituentRow[]>) => map.get(snapshotIds[0]) ?? []);
  }

  async function fetchConstituentMap(snapshotIds: string[]) {
    if (snapshotIds.length === 0) {
      return new Map<string, ConstituentRow[]>();
    }

    const params = snapshotIds.map((id, index) => `$${index + 1}`).join(",");
    const sql = `SELECT * FROM ius.universe_constituents WHERE snapshot_id IN (${params}) ORDER BY position ASC`;
    const result = await pool.query<ConstituentRow>(sql, snapshotIds);

    const map = new Map<string, ConstituentRow[]>();
    for (const row of result.rows) {
      const list = map.get(row.snapshot_id) ?? [];
      list.push(row);
      map.set(row.snapshot_id, list);
    }
    return map;
  }

  function mapSnapshotAggregate(
  snapshot: SnapshotRow,
  constituents: ConstituentRow[],
): UniverseSnapshotAggregate {
  return {
    snapshot: {
      snapshot_id: snapshot.snapshot_id,
      tenant_id: snapshot.tenant_id,
      as_of_date: toDateString(snapshot.as_of_date),
      effective_at: toTimestampString(snapshot.effective_at),
      published_at: toTimestampString(snapshot.published_at),
      source: snapshot.source,
      hash: snapshot.hash,
      status: snapshot.status,
    },
    constituents: constituents.map((row) => ({
      constituent_id: row.constituent_id,
      snapshot_id: row.snapshot_id,
      tenant_id: row.tenant_id,
      position: row.position,
      ticker: row.ticker,
      cusip: row.cusip ?? undefined,
      isin: row.isin ?? undefined,
      free_float_market_cap: toNumber(row.free_float_market_cap),
      weight: toNumber(row.weight),
      sector: row.sector ?? undefined,
      currency: row.currency,
    })),
  };
}

function validateConstituents(constituents: UniverseConstituentRecord[]) {
  const positionSet = new Set<number>();
  const tickerSet = new Set<string>();
  const idSet = new Set<string>();

  for (const row of constituents) {
    if (idSet.has(row.constituent_id)) {
      throw new Error("duplicate_constituent_id");
    }
    idSet.add(row.constituent_id);

    if (positionSet.has(row.position)) {
      throw new Error("duplicate_constituent_position");
    }
    positionSet.add(row.position);

    if (tickerSet.has(row.ticker)) {
      throw new Error("duplicate_constituent_ticker");
    }
    tickerSet.add(row.ticker);
  }
}

return {
  saveSnapshot,
  getLatestSnapshot,
  listSnapshots,
};
}

function toDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function toTimestampString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function toNumber(value: unknown): number {
  return typeof value === "string" ? Number(value) : (value as number);
}



