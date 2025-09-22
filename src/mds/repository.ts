import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PriceSnapshotAggregate } from "./snapshot";

type SnapshotRow = {
  snapshot_id: string;
  tenant_id: string;
  as_of_date: string | Date;
  vendor: string;
  published_at: string | Date;
  status: string;
  hash: string;
};

type PriceRow = {
  price_id: string;
  snapshot_id: string;
  tenant_id: string;
  ticker: string;
  mic: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  currency: string;
};

type FactorRow = {
  factor_id: string;
  snapshot_id: string;
  tenant_id: string;
  ticker: string;
  factor_name: string;
  value: number;
  as_of_date: string | Date;
};

type PriceSeriesRow = {
  as_of_date: string | Date;
  vendor: string;
  ticker: string;
  mic: string;
  close: number;
  volume: number | null;
  currency: string;
};

type FactorSeriesRow = {
  as_of_date: string | Date;
  vendor: string;
  ticker: string;
  factor_name: string;
  value: number;
};

type CorporateActionRow = {
  event_id: string;
  ticker: string;
  event_type: string;
  effective_date: string | Date;
  recorded_at: string | Date;
  details: unknown;
};

export interface CreatePriceRepositoryDeps {
  pool: Pick<Pool, "connect">;
}

export interface PriceRepository {
  saveSnapshot(snapshot: PriceSnapshotAggregate): Promise<void>;
  getLatestSnapshot(tenantId: string, vendor: string, asOfDate?: string): Promise<PriceSnapshotAggregate | null>;
  getPriceSeries(
    tenantId: string,
    vendor: string,
    options: { tickers?: string[]; startDate?: string; endDate?: string }
  ): Promise<PriceSeriesRow[]>;
  getFactorSeries(
    tenantId: string,
    vendor: string,
    options: { tickers?: string[]; factorNames?: string[]; startDate?: string; endDate?: string }
  ): Promise<FactorSeriesRow[]>;
  listCorporateActions(
    tenantId: string,
    options: { tickers?: string[]; startDate?: string; endDate?: string; eventTypes?: string[] }
  ): Promise<CorporateActionRow[]>;
}

function toDateString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

function toTimestampString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

export function createPriceRepository({ pool }: CreatePriceRepositoryDeps): PriceRepository {
  return {
    async saveSnapshot(snapshot) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO mds.price_snapshots (
             snapshot_id, tenant_id, as_of_date, vendor, published_at, status, hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            snapshot.snapshot.snapshot_id,
            snapshot.snapshot.tenant_id,
            snapshot.snapshot.as_of_date,
            snapshot.snapshot.vendor,
            snapshot.snapshot.published_at,
            snapshot.snapshot.status,
            snapshot.snapshot.hash,
          ],
        );

        const priceInsert = `INSERT INTO mds.prices (
          price_id, snapshot_id, tenant_id, ticker, mic, open, high, low, close, volume, currency
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;

        for (const price of snapshot.prices) {
          await client.query(priceInsert, [
            price.price_id ?? randomUUID(),
            snapshot.snapshot.snapshot_id,
            snapshot.snapshot.tenant_id,
            price.ticker,
            price.mic,
            price.open ?? null,
            price.high ?? null,
            price.low ?? null,
            price.close,
            price.volume ?? null,
            price.currency,
          ]);
        }

        const factorInsert = `INSERT INTO mds.factors (
          factor_id, snapshot_id, tenant_id, ticker, factor_name, value, as_of_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`;

        for (const factor of snapshot.factors) {
          await client.query(factorInsert, [
            factor.factor_id ?? randomUUID(),
            snapshot.snapshot.snapshot_id,
            snapshot.snapshot.tenant_id,
            factor.ticker,
            factor.factor_name,
            factor.value,
            factor.as_of_date,
          ]);
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getLatestSnapshot(tenantId, vendor, asOfDate) {
      const client = await pool.connect();
      try {
        const params: Array<string> = [tenantId, vendor];
        let whereClause = "";
        if (asOfDate) {
          params.push(asOfDate);
          whereClause = " AND as_of_date <= $3::date";
        }

        const snapshotSql = `SELECT snapshot_id, tenant_id, as_of_date, vendor, published_at, status, hash
           FROM mds.price_snapshots
           WHERE tenant_id = $1 AND vendor = $2${whereClause}
           ORDER BY as_of_date DESC, published_at DESC
           LIMIT 1`;

        const snapshotResult = await client.query<SnapshotRow>(snapshotSql, params);
        const snapshotRow = snapshotResult.rows[0];
        if (!snapshotRow) {
          return null;
        }

        const priceRows = await client.query<PriceRow>(
          `SELECT price_id, snapshot_id, tenant_id, ticker, mic, open, high, low, close, volume, currency
           FROM mds.prices WHERE snapshot_id = $1 ORDER BY ticker`,
          [snapshotRow.snapshot_id],
        );
        const factorRows = await client.query<FactorRow>(
          `SELECT factor_id, snapshot_id, tenant_id, ticker, factor_name, value, as_of_date
           FROM mds.factors WHERE snapshot_id = $1 ORDER BY ticker, factor_name`,
          [snapshotRow.snapshot_id],
        );

        return {
          snapshot: {
            snapshot_id: snapshotRow.snapshot_id,
            tenant_id: snapshotRow.tenant_id,
            as_of_date: toDateString(snapshotRow.as_of_date),
            vendor: snapshotRow.vendor,
            published_at: toTimestampString(snapshotRow.published_at),
            status: snapshotRow.status as PriceSnapshotAggregate["snapshot"]["status"],
            hash: snapshotRow.hash,
          },
          prices: priceRows.rows.map((row) => ({
            price_id: row.price_id,
            snapshot_id: row.snapshot_id,
            tenant_id: row.tenant_id,
            ticker: row.ticker,
            mic: row.mic,
            open: row.open ?? undefined,
            high: row.high ?? undefined,
            low: row.low ?? undefined,
            close: Number(row.close),
            volume: row.volume ?? undefined,
            currency: row.currency,
          })),
          factors: factorRows.rows.map((row) => ({
            factor_id: row.factor_id,
            snapshot_id: row.snapshot_id,
            tenant_id: row.tenant_id,
            ticker: row.ticker,
            factor_name: row.factor_name,
            value: Number(row.value),
            as_of_date: toDateString(row.as_of_date),
          })),
        };
      } finally {
        client.release();
      }
    },

    async getPriceSeries(tenantId, vendor, options) {
      const client = await pool.connect();
      try {
        const params: Array<any> = [tenantId, vendor];
        const filters: string[] = [];

        if (options.startDate) {
          params.push(options.startDate);
          filters.push(` s.as_of_date >= $${params.length}::date`);
        }
        if (options.endDate) {
          params.push(options.endDate);
          filters.push(` s.as_of_date <= $${params.length}::date`);
        }
        if (options.tickers && options.tickers.length > 0) {
          params.push(options.tickers);
          filters.push(` p.ticker = ANY($${params.length}::text[])`);
        }

        const whereClause = filters.length ? ` AND${filters.join(" AND")}` : "";

        const seriesSql = `SELECT s.as_of_date, s.vendor, p.ticker, p.mic, p.close, p.volume, p.currency
           FROM mds.price_snapshots s
           JOIN mds.prices p ON p.snapshot_id = s.snapshot_id
           WHERE s.tenant_id = $1 AND s.vendor = $2${whereClause}
           ORDER BY s.as_of_date ASC, p.ticker ASC`;

        const result = await client.query<PriceSeriesRow>(seriesSql, params);

        return result.rows.map((row) => ({
          as_of_date: toDateString(row.as_of_date),
          vendor: row.vendor,
          ticker: row.ticker,
          mic: row.mic,
          close: Number(row.close),
          volume: row.volume,
          currency: row.currency,
        }));
      } finally {
        client.release();
      }
    },

    async getFactorSeries(tenantId, vendor, options) {
      const client = await pool.connect();
      try {
        const params: Array<any> = [tenantId, vendor];
        const filters: string[] = [];

        if (options.startDate) {
          params.push(options.startDate);
          filters.push(` s.as_of_date >= $${params.length}::date`);
        }
        if (options.endDate) {
          params.push(options.endDate);
          filters.push(` s.as_of_date <= $${params.length}::date`);
        }
        if (options.tickers && options.tickers.length > 0) {
          params.push(options.tickers);
          filters.push(` f.ticker = ANY($${params.length}::text[])`);
        }
        if (options.factorNames && options.factorNames.length > 0) {
          params.push(options.factorNames);
          filters.push(` f.factor_name = ANY($${params.length}::text[])`);
        }

        const whereClause = filters.length ? ` AND${filters.join(" AND")}` : "";

        const factorSql = `SELECT s.as_of_date, s.vendor, f.ticker, f.factor_name, f.value
           FROM mds.price_snapshots s
           JOIN mds.factors f ON f.snapshot_id = s.snapshot_id
           WHERE s.tenant_id = $1 AND s.vendor = $2${whereClause}
           ORDER BY s.as_of_date ASC, f.ticker ASC, f.factor_name ASC`;

        const result = await client.query<FactorSeriesRow>(factorSql, params);

        return result.rows.map((row) => ({
          as_of_date: toDateString(row.as_of_date),
          vendor: row.vendor,
          ticker: row.ticker,
          factor_name: row.factor_name,
          value: Number(row.value),
        }));
      } finally {
        client.release();
      }
    },

    async listCorporateActions(tenantId, options) {
      const client = await pool.connect();
      try {
        const params: Array<any> = [tenantId];
        const filters: string[] = [];

        if (options.startDate) {
          params.push(options.startDate);
          filters.push(` effective_date >= $${params.length}::date`);
        }
        if (options.endDate) {
          params.push(options.endDate);
          filters.push(` effective_date <= $${params.length}::date`);
        }
        if (options.tickers && options.tickers.length > 0) {
          params.push(options.tickers);
          filters.push(` ticker = ANY($${params.length}::text[])`);
        }
        if (options.eventTypes && options.eventTypes.length > 0) {
          params.push(options.eventTypes);
          filters.push(` event_type = ANY($${params.length}::text[])`);
        }

        const whereClause = filters.length ? ` AND${filters.join(" AND")}` : "";

        const actionSql = `SELECT event_id, ticker, event_type, effective_date, recorded_at, details
           FROM mds.corporate_actions
           WHERE tenant_id = $1${whereClause}
           ORDER BY effective_date DESC, ticker ASC`;

        const result = await client.query<CorporateActionRow>(actionSql, params);
        return result.rows.map((row) => ({
          event_id: row.event_id,
          ticker: row.ticker,
          event_type: row.event_type,
          effective_date: toDateString(row.effective_date),
          recorded_at: toTimestampString(row.recorded_at),
          details: row.details,
        }));
      } finally {
        client.release();
      }
    },
  };
}

export type { PriceSeriesRow, FactorSeriesRow, CorporateActionRow };
