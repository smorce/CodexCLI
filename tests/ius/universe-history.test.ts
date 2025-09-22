import { describe, expect, it } from "vitest";
import { createIusApp } from "../../src/ius/server";
import type {
  JobService,
  UniverseListResult,
  UniverseRepository,
  UniverseSnapshotAggregate,
} from "../../src/ius/server";
import type { UniverseConstituentRecord, UniverseSnapshotRecord } from "../../src/ius/snapshot";

class RepoWithHistory implements UniverseRepository {
  constructor(private snapshots: UniverseSnapshotAggregate[]) {}

  async getLatestSnapshot(tenantId: string) {
    return (
      this.snapshots
        .filter((record) => record.snapshot.tenant_id === tenantId)
        .sort((a, b) => (a.snapshot.as_of_date < b.snapshot.as_of_date ? 1 : -1))[0] ?? null
    );
  }

  async listSnapshots(
    tenantId: string,
    options: { startDate?: string; endDate?: string; limit?: number; cursor?: string }
  ): Promise<UniverseListResult> {
    if (options.cursor) {
      return { items: [], nextCursor: null };
    }

    let records = this.snapshots.filter((record) => record.snapshot.tenant_id === tenantId);
    if (options.startDate) {
      records = records.filter((record) => record.snapshot.as_of_date >= options.startDate!);
    }
    if (options.endDate) {
      records = records.filter((record) => record.snapshot.as_of_date <= options.endDate!);
    }

    records = records.sort((a, b) => (a.snapshot.as_of_date < b.snapshot.as_of_date ? 1 : -1));

    const limit = options.limit ?? 25;

    return {
      items: records.slice(0, limit),
      nextCursor: records.length > limit ? records[limit].snapshot.snapshot_id : null,
      totalCount: records.length,
    };
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

describe("GET /universe/history", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";

  const baseSnapshot = (asOf: string, idSuffix: string): UniverseSnapshotRecord => ({
    snapshot_id: `00000000-0000-4000-8000-${idSuffix}`,
    tenant_id: tenantId,
    as_of_date: asOf,
    effective_at: `${asOf}T21:00:00Z`,
    published_at: `${asOf}T22:15:00Z`,
    source: "spdj",
    hash: "b".repeat(64),
    status: "active",
  });

  const constituents = (snapshotId: string): UniverseConstituentRecord[] => [
    {
      constituent_id: `${snapshotId}-1`,
      snapshot_id: snapshotId,
      tenant_id: tenantId,
      position: 1,
      ticker: "NVDA",
      free_float_market_cap: 1,
      weight: 0.2,
      sector: "Technology",
      currency: "USD",
    },
  ];

  it("returns paginated snapshots", async () => {
    const repo = new RepoWithHistory([
      {
        snapshot: baseSnapshot("2025-09-20", "000000000001"),
        constituents: constituents("00000000-0000-4000-8000-000000000001"),
      },
      {
        snapshot: baseSnapshot("2025-09-19", "000000000002"),
        constituents: constituents("00000000-0000-4000-8000-000000000002"),
      },
    ]);

    const app = createIusApp({
      universeRepo: repo,
      auth: {
        async verify() {
          return { tenantId, roles: ["portfolio.viewer"] };
        },
      },
      jobService: noopJobService,
    });

    const response = await app.request(
      "http://localhost/universe/history?limit=1&startDate=2025-09-19&endDate=2025-09-20"
    );
    expect(response.status).toEqual(200);
    const body = (await response.json()) as any;

    expect(body.items).toHaveLength(1);
    expect(body.items[0].asOfDate).toEqual("2025-09-20");
    expect(body.nextCursor).not.toBeNull();
    expect(body.totalCount).toEqual(2);
  });

  it("returns 403 for missing role", async () => {
    const repo = new RepoWithHistory([]);
    const app = createIusApp({
      universeRepo: repo,
      auth: {
        async verify() {
          return { tenantId, roles: ["compliance.viewer"] };
        },
      },
      jobService: noopJobService,
    });

    const response = await app.request("http://localhost/universe/history");
    expect(response.status).toEqual(403);
  });
});
