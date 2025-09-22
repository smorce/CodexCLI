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

describe("Factor API", () => {
  it("filters by factor name and date", async () => {
    const pool = createPool();
    const repo = createPriceRepository({ pool });
    await repo.saveSnapshot(
      buildPriceSnapshot({
        tenantId,
        vendor: "spdj",
        asOfDate: "2025-09-19",
        publishedAt: "2025-09-20T00:00:00Z",
        prices: [
          { ticker: "NVDA", mic: "XNAS", close: 100, currency: "USD" }
        ],
        factors: [
          { ticker: "NVDA", factorName: "MOM", value: 0.12 },
          { ticker: "NVDA", factorName: "SIZE", value: -0.05 },
        ],
      }),
    );

    const api = createPriceApi({ priceRepo: repo });
    const result = await api.getFactorSeries({
      tenantId,
      vendor: "spdj",
      factorNames: ["MOM"],
      startDate: "2025-09-18",
      endDate: "2025-09-19",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ ticker: "NVDA", factorName: "MOM", value: 0.12 });

    await pool.end();
  });
});
