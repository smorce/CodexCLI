import { describe, expect, it } from "vitest";
import { buildPriceSnapshot } from "../snapshot";

const payload = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  asOfDate: "2025-09-19",
  vendor: "spdj" as const,
  publishedAt: "2025-09-20T01:00:00Z",
  prices: [
    { ticker: "NVDA", mic: "XNAS", close: 104.22, currency: "USD" },
  ],
  factors: [
    { ticker: "NVDA", factorName: "MOM", value: 0.12 },
  ],
};

describe("buildPriceSnapshot", () => {
  it("generates ids, hashes, and normalized rows", () => {
    const snapshot = buildPriceSnapshot(payload);
    expect(snapshot.snapshot.snapshot_id).toMatch(/[0-9a-f-]{36}/);
    expect(snapshot.snapshot.hash).toHaveLength(64);
    expect(snapshot.prices[0].snapshot_id).toEqual(snapshot.snapshot.snapshot_id);
  });

  it("validates presence of prices", () => {
    expect(() => buildPriceSnapshot({ ...payload, prices: [] })).toThrowError(/prices must contain at least one/);
  });
});
