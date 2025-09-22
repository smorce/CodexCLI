import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPriceRepository } from "../../src/mds/repository";
import { buildPriceSnapshot } from "../../src/mds/snapshot";
import { createPriceApi } from "../../src/mds/service";

const migrationPath = resolve(__dirname, "../../src/mds/sql/0001_init.sql");
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createPoolWithMigration() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const sql = readFileSync(migrationPath, "utf8");
  pool.query(sql);
  return pool;
}

async function seed(repo: ReturnType<typeof createPriceRepository>) {
  const snapshot = buildPriceSnapshot({
    tenantId,
    vendor: "spdj",
    asOfDate: "2025-09-19",
    publishedAt: "2025-09-20T00:00:00Z",
    prices: [
      { ticker: "NVDA", mic: "XNAS", close: 104.22, currency: "USD" },
      { ticker: "MSFT", mic: "XNAS", close: 312.11, currency: "USD" }
    ],
    factors: [
      { ticker: "NVDA", factorName: "MOM", value: 0.12 },
      { ticker: "MSFT", factorName: "SIZE", value: -0.03 }
    ],
  });

  await repo.saveSnapshot(snapshot);
  return snapshot;
}

describe("Price API", () => {
  it("returns latest prices", async () => {
    const pool = createPoolWithMigration();
    const repo = createPriceRepository({ pool });
    const seeded = await seed(repo);
    const api = createPriceApi({ priceRepo: repo });

    const result = await api.getLatestPrices({ tenantId, vendor: "spdj" });

    expect(result.snapshot.as_of_date).toEqual(seeded.snapshot.as_of_date);
    expect(result.prices).toHaveLength(2);
    expect(result.factors).toHaveLength(2);

    await pool.end();
  });
});
