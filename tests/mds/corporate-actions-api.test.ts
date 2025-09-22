import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createPriceRepository } from "../../src/mds/repository";
import { createPriceApi } from "../../src/mds/service";

const migrationPath = resolve(__dirname, "../../src/mds/sql/0001_init.sql");
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const sql = readFileSync(migrationPath, "utf8");
  pool.query(sql);
  return pool;
}

describe("Corporate actions API", () => {
  it("lists actions by ticker and date", async () => {
    const pool = createPool();
    const repo = createPriceRepository({ pool });
    await repo.saveSnapshot({
      snapshot: {
        snapshot_id: randomUUID(),
        tenant_id: tenantId,
        as_of_date: "2025-09-19",
        vendor: "spdj",
        published_at: "2025-09-20T00:00:00Z",
        status: "active",
        hash: "hash",
      },
      prices: [],
      factors: [],
    });

    await pool.query(
      `INSERT INTO mds.corporate_actions (event_id, tenant_id, ticker, event_type, effective_date, details)
       VALUES ($1,$2,$3,$4,$5,$6), ($7,$2,$8,$9,$10,$11)`,
      [
        randomUUID(),
        tenantId,
        "NVDA",
        "split",
        "2025-09-21",
        { ratio: "4:1" },
        randomUUID(),
        "MSFT",
        "dividend",
        "2025-09-18",
        { amount: 0.65 },
      ],
    );

    const api = createPriceApi({ priceRepo: repo });
    const result = await api.listCorporateActions({
      tenantId,
      tickers: ["NVDA"],
      startDate: "2025-09-20",
      endDate: "2025-09-22",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toEqual("split");

    await pool.end();
  });
});
