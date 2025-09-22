import { describe, expect, it } from "vitest";
import { createIusApp } from "../../src/ius/server";
import type {
  JobService,
  UniverseListResult,
  UniverseRepository,
  UniverseSnapshotAggregate,
} from "../../src/ius/server";
import type { UniverseConstituentRecord, UniverseSnapshotRecord } from "../../src/ius/snapshot";

class InMemoryUniverseRepo implements UniverseRepository {
  private snapshot: UniverseSnapshotAggregate | null;

  constructor(snapshot: UniverseSnapshotAggregate | null) {
    this.snapshot = snapshot;
  }

  async getLatestSnapshot(): Promise<UniverseSnapshotAggregate | null> {
    return this.snapshot;
  }

  async listSnapshots(): Promise<UniverseListResult> {
    return { items: this.snapshot ? [this.snapshot] : [], nextCursor: null, totalCount: this.snapshot ? 1 : 0 };
  }
}

const noopJobService: JobService = {
  async enqueueManualJob() {
    return {
      jobId: "noop",
      status: "queued",
      requestedAt: new Date().toISOString(),
      effectiveDate: null,
      queueEventId: null,
    };
  },
};

describe("GET /universe/current", () => {
  it("returns the latest snapshot", async () => {
    const snapshot: UniverseSnapshotRecord = {
      snapshot_id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      as_of_date: "2025-09-19",
      effective_at: "2025-09-19T21:00:00Z",
      published_at: "2025-09-19T22:15:00Z",
      source: "spdj",
      hash: "a".repeat(64),
      status: "active",
    };
    const constituents: UniverseConstituentRecord[] = [
      {
        constituent_id: "33333333-3333-4333-8333-333333333333",
        snapshot_id: snapshot.snapshot_id,
        tenant_id: snapshot.tenant_id,
        position: 1,
        ticker: "NVDA",
        free_float_market_cap: 1,
        weight: 0.2,
        sector: "Technology",
        currency: "USD",
      },
    ];

    const repo = new InMemoryUniverseRepo({ snapshot, constituents });
    const app = createIusApp({
      universeRepo: repo,
      auth: {
        async verify() {
          return { tenantId: snapshot.tenant_id, roles: ["portfolio.viewer"] };
        },
      },
      jobService: noopJobService,
    });

    const response = await app.request("http://localhost/universe/current");

    expect(response.status).toEqual(200);
    const body = (await response.json()) as any;
    expect(body.snapshotId).toEqual(snapshot.snapshot_id);
    expect(body.constituents).toHaveLength(1);
  });

  it("returns 404 when no snapshot", async () => {
    const repo = new InMemoryUniverseRepo(null);
    const app = createIusApp({
      universeRepo: repo,
      auth: {
        async verify() {
          return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.viewer"] };
        },
      },
      jobService: noopJobService,
    });

    const response = await app.request("http://localhost/universe/current");

    expect(response.status).toEqual(404);
  });
});
