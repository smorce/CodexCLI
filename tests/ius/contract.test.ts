import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createIusApp } from "../../src/ius/server";
import type {
  JobService,
  UniverseListResult,
  UniverseRepository,
  UniverseSnapshotAggregate,
} from "../../src/ius/server";

const specPath = resolve(__dirname, "../../documents/IndexUniverseService_OpenAPI.yaml");
const spec = readFileSync(specPath, "utf8");
const parsed = parse(spec) as any;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const components = parsed.components?.schemas ?? {};
for (const [name, schema] of Object.entries(components)) {
  const schemaObject = schema as Record<string, unknown>;
  ajv.addSchema(Object.assign({ $id: `#/components/schemas/${name}` }, schemaObject));
}

const validateSnapshot = ajv.getSchema("#/components/schemas/UniverseSnapshot");
const validateSnapshotPage = ajv.getSchema("#/components/schemas/UniverseSnapshotPage");
const validateJobResponse = ajv.getSchema("#/components/schemas/RebalanceJobResponse");

if (!validateSnapshot || !validateSnapshotPage || !validateJobResponse) {
  throw new Error("Failed to load OpenAPI schemas for contract tests");
}

class ContractRepo implements UniverseRepository {
  constructor(private aggregates: UniverseSnapshotAggregate[]) {}

  async getLatestSnapshot(): Promise<UniverseSnapshotAggregate | null> {
    return this.aggregates[0] ?? null;
  }

  async listSnapshots(): Promise<UniverseListResult> {
    return { items: this.aggregates, nextCursor: null, totalCount: this.aggregates.length };
  }
}

const stubJobService: JobService = {
  async enqueueManualJob() {
    return {
      jobId: "55555555-5555-4555-8555-555555555555",
      status: "queued",
      requestedAt: "2025-09-22T02:00:00Z",
      effectiveDate: "2025-09-22",
      queueEventId: "q-555",
    };
  },
};

const aggregate: UniverseSnapshotAggregate = {
  snapshot: {
    snapshot_id: "66666666-6666-4666-8666-666666666666",
    tenant_id: "11111111-1111-4111-8111-111111111111",
    as_of_date: "2025-09-19",
    effective_at: "2025-09-19T21:00:00Z",
    published_at: "2025-09-19T22:15:00Z",
    source: "spdj",
    hash: "c".repeat(64),
    status: "active",
  },
  constituents: [
    {
      constituent_id: "77777777-7777-4777-8777-777777777777",
      snapshot_id: "66666666-6666-4666-8666-666666666666",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      position: 1,
      ticker: "NVDA",
      free_float_market_cap: 1,
      weight: 0.2,
      sector: "Technology",
      currency: "USD",
      cusip: "123456789",
      isin: "US1234567890",
    },
  ],
};

describe("OpenAPI contract", () => {
  const app = createIusApp({
    universeRepo: new ContractRepo([aggregate]),
    auth: {
      async verify() {
        return { tenantId: "11111111-1111-4111-8111-111111111111", roles: ["portfolio.admin", "portfolio.viewer"] };
      },
    },
    jobService: stubJobService,
  });

  it("GET /universe/current matches schema", async () => {
    const res = await app.request("http://localhost/universe/current?includeConstituentMeta=true");
    expect(res.status).toEqual(200);
    const body = await res.json();
    expect(validateSnapshot(body)).toBe(true);
  });

  it("GET /universe/history matches schema", async () => {
    const res = await app.request("http://localhost/universe/history?includeConstituentMeta=true");
    expect(res.status).toEqual(200);
    const body = await res.json();
    expect(validateSnapshotPage(body)).toBe(true);
  });

  it("POST /universe/rebalance-job matches schema", async () => {
    const res = await app.request("http://localhost/universe/rebalance-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual_override" }),
    });
    expect(res.status).toEqual(202);
    const body = await res.json();
    expect(validateJobResponse(body)).toBe(true);
  });
});





