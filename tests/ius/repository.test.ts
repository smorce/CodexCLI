import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createUniverseRepository } from "../../src/ius/repository";
import type { BuildSnapshotInput } from "../../src/ius/snapshot";
import { buildSnapshotRecords } from "../../src/ius/snapshot";

const migrationPath = resolve(__dirname, "../../src/ius/sql/0001_init.sql");

const samplePayload: BuildSnapshotInput = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  asOfDate: "2025-09-19",
  effectiveAt: "2025-09-19T21:00:00Z",
  publishedAt: "2025-09-19T22:15:00Z",
  source: "spdj",
  constituents: Array.from({ length: 10 }).map((_, index) => ({
    ticker: `SYM${String.fromCharCode(65 + index)}`,
    freeFloatMarketCap: 1_000_000_000 + index * 1000,
    sector: "Technology",
  })),
};

describe("Universe repository", () => {
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

  it("persists snapshot and constituents atomically", async () => {
    const repo = createUniverseRepository({ pool });

    const { snapshot, constituents } = buildSnapshotRecords(samplePayload);
    await repo.saveSnapshot(snapshot, constituents);

    const latest = await repo.getLatestSnapshot(samplePayload.tenantId);
    expect(latest).not.toBeNull();
    expect(latest?.snapshot.as_of_date).toEqual(samplePayload.asOfDate);
    expect(latest?.constituents).toHaveLength(10);
  });

  it("enforces uniqueness constraints", async () => {
    const repo = createUniverseRepository({ pool });

    const { snapshot, constituents } = buildSnapshotRecords(samplePayload);
    constituents[1].constituent_id = constituents[0].constituent_id;

    await expect(repo.saveSnapshot(snapshot, constituents)).rejects.toThrow();
  });
});
