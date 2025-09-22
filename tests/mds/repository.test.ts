import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPriceRepository } from "../../src/mds/repository";
import { buildPriceSnapshot } from "../../src/mds/snapshot";

const migrationPath = resolve(__dirname, "../../src/mds/sql/0001_init.sql");

const payload = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  asOfDate: "2025-09-19",
  vendor: "spdj" as const,
  publishedAt: "2025-09-20T01:00:00Z",
  prices: Array.from({ length: 3 }).map((_, idx) => ({
    ticker: ["NVDA", "MSFT", "AAPL"][idx],
    mic: "XNAS",
    open: 100 + idx,
    high: 105 + idx,
    low: 99 + idx,
    close: 104 + idx,
    volume: 1000000 + idx * 1000,
    currency: "USD",
  })),
  factors: [
    { ticker: "NVDA", factorName: "MOM", value: 0.12 },
    { ticker: "MSFT", factorName: "SIZE", value: -0.03 },
  ],
};

describe("Price repository", () => {
  let pool: Pool;

  beforeEach(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
    const sql = readFileSync(migrationPath, "utf8");
    await pool.query(sql);
  });

  afterEach(async () => {
    await pool.end();
  });

  it("persists snapshot, prices, and factors", async () => {
    const repo = createPriceRepository({ pool });
    const snapshot = buildPriceSnapshot(payload);

    await repo.saveSnapshot(snapshot);

    const latest = await repo.getLatestSnapshot(payload.tenantId, payload.vendor, payload.asOfDate);
    expect(latest).not.toBeNull();
    expect(latest?.prices).toHaveLength(3);
    expect(latest?.factors).toHaveLength(2);
  });

  it("rejects duplicate snapshots for same vendor/date", async () => {
    const repo = createPriceRepository({ pool });
    const snapshot = buildPriceSnapshot(payload);
    await repo.saveSnapshot(snapshot);

    const duplicate = buildPriceSnapshot({ ...payload, publishedAt: "2025-09-20T02:10:00Z" });
    await expect(repo.saveSnapshot(duplicate)).rejects.toThrow();
  });
});
