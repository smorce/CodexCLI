import { describe, expect, it, vi } from "vitest";
import { createIusApp } from "../../src/ius/server";
import type {
  UniverseListResult,
  UniverseRepository,
  UniverseSnapshotAggregate,
} from "../../src/ius/server";

class NullUniverseRepo implements UniverseRepository {
  async getLatestSnapshot(): Promise<UniverseSnapshotAggregate | null> {
    return null;
  }

  async listSnapshots(): Promise<UniverseListResult> {
    return { items: [], nextCursor: null, totalCount: 0 };
  }
}

describe("POST /universe/rebalance-job", () => {
  it("queues a manual job", async () => {
    const jobService = {
      enqueueManualJob: vi.fn().mockResolvedValue({
        jobId: "44444444-4444-4444-8444-444444444444",
        status: "queued",
        requestedAt: "2025-09-22T01:00:00Z",
        effectiveDate: "2025-09-22",
        queueEventId: "q-123",
      }),
    };

    const app = createIusApp({
      universeRepo: new NullUniverseRepo(),
      auth: {
        async verify() {
          return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.admin"] };
        },
      },
      jobService,
    });

    const response = await app.request("http://localhost/universe/rebalance-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ effectiveDate: "2025-09-22", force: true }),
    });

    expect(response.status).toEqual(202);
    const body = (await response.json()) as any;
    expect(body.jobId).toEqual("44444444-4444-4444-8444-444444444444");
    expect(jobService.enqueueManualJob).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        effectiveDate: "2025-09-22",
        source: "manual_override",
        force: true,
      }
    );
  });

  it("returns 409 when duplicate job", async () => {
    const jobService = {
      enqueueManualJob: vi.fn().mockRejectedValue(new Error("duplicate_job")),
    };

    const app = createIusApp({
      universeRepo: new NullUniverseRepo(),
      auth: {
        async verify() {
          return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.admin"] };
        },
      },
      jobService,
    });

    const response = await app.request("http://localhost/universe/rebalance-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toEqual(409);
  });

  it("rejects invalid effectiveDate", async () => {
    const jobService = {
      enqueueManualJob: vi.fn(),
    };

    const app = createIusApp({
      universeRepo: new NullUniverseRepo(),
      auth: {
        async verify() {
          return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.admin"] };
        },
      },
      jobService,
    });

    const response = await app.request("http://localhost/universe/rebalance-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ effectiveDate: "invalid" }),
    });

    expect(response.status).toEqual(400);
    expect(jobService.enqueueManualJob).not.toHaveBeenCalled();
  });

  it("returns 403 when caller lacks admin role", async () => {
    const jobService = {
      enqueueManualJob: vi.fn(),
    };

    const app = createIusApp({
      universeRepo: new NullUniverseRepo(),
      auth: {
        async verify() {
          return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.viewer"] };
        },
      },
      jobService,
    });

    const response = await app.request("http://localhost/universe/rebalance-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toEqual(403);
  });
});

