import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPriceRepository } from "../../src/mds/repository";
import { buildPriceSnapshot } from "../../src/mds/snapshot";
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

async function seedSnapshots(repo: ReturnType<typeof createPriceRepository>) {
  const basePrices = [
    { ticker: "NVDA", mic: "XNAS", close: 104.22, currency: "USD" },
    { ticker: "MSFT", mic: "XNAS", close: 312.11, currency: "USD" }
  ];

  await repo.saveSnapshot(
    buildPriceSnapshot({
      tenantId,
      vendor: "spdj",
      asOfDate: "2025-09-17",
      publishedAt: "2025-09-18T01:00:00Z",
      prices: basePrices.map((p) => ({ ...p, close: p.close - 3 })),
      factors: [],
    }),
  );

  await repo.saveSnapshot(
    buildPriceSnapshot({
      tenantId,
      vendor: "spdj",
      asOfDate: "2025-09-18",
      publishedAt: "2025-09-19T01:00:00Z",
      prices: basePrices.map((p) => ({ ...p, close: p.close - 1 })),
      factors: [],
    }),
  );

  await repo.saveSnapshot(
    buildPriceSnapshot({
      tenantId,
      vendor: "spdj",
      asOfDate: "2025-09-19",
      publishedAt: "2025-09-20T01:00:00Z",
      prices: basePrices,
      factors: [],
    }),
  );
}

describe("Price API range", () => {
  it("filters by ticker and date range", async () => {
    const pool = createPool();
    const repo = createPriceRepository({ pool });
    await seedSnapshots(repo);

    const api = createPriceApi({ priceRepo: repo });
    const response = await api.getPriceSeries({
      tenantId,
      vendor: "spdj",
      tickers: ["NVDA"],
      startDate: "2025-09-18",
      endDate: "2025-09-19",
    });

    expect(response.items).toHaveLength(2);
    expect(response.items[0].ticker).toEqual("NVDA");
    expect(response.items[0].asOfDate).toEqual("2025-09-18");

    await pool.end();
  });
});
