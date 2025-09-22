import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPriceRepository } from "../../src/mds/repository";
import { createIngestionService } from "../../src/mds/ingestion";

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

describe("Market data ingestion service", () => {
  it("persists snapshot and publishes queue message", async () => {
    const pool = createPool();
    const repo = createPriceRepository({ pool });
    const messages: any[] = [];
    const service = createIngestionService({
      priceRepo: repo,
      queue: { async send(msg) { messages.push(msg); } },
      clock: () => new Date("2025-09-20T00:00:00Z"),
    });

    const result = await service.ingestPriceSnapshot({
      tenantId,
      vendor: "spdj",
      asOfDate: "2025-09-19",
      publishedAt: "2025-09-20T00:00:00Z",
      prices: [
        { ticker: "NVDA", mic: "XNAS", close: 104.22, currency: "USD" },
      ],
      factors: [],
    });

    expect(result.snapshotId).toMatch(/[0-9a-f-]{36}/);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ eventType: "marketdata.ingested", asOfDate: "2025-09-19" });

    await pool.end();
  });
});
