import { describe, expect, it } from "vitest";
import { buildSnapshotRecords } from "../../src/ius/snapshot";

const samplePayload = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  asOfDate: "2025-09-19",
  effectiveAt: "2025-09-19T21:00:00Z",
  publishedAt: "2025-09-19T22:15:00Z",
  source: "spdj" as const,
  constituents: [
    { ticker: "NVDA", freeFloatMarketCap: 1_000_000_000_000, sector: "Technology" },
    { ticker: "MSFT", freeFloatMarketCap: 950_000_000_000, sector: "Technology" },
    { ticker: "AAPL", freeFloatMarketCap: 900_000_000_000, sector: "Technology" },
    { ticker: "GOOGL", freeFloatMarketCap: 650_000_000_000, sector: "Communication Services" },
    { ticker: "GOOG", freeFloatMarketCap: 630_000_000_000, sector: "Communication Services" },
    { ticker: "AMZN", freeFloatMarketCap: 600_000_000_000, sector: "Consumer Discretionary" },
    { ticker: "META", freeFloatMarketCap: 500_000_000_000, sector: "Communication Services" },
    { ticker: "AVGO", freeFloatMarketCap: 450_000_000_000, sector: "Technology" },
    { ticker: "TSLA", freeFloatMarketCap: 410_000_000_000, sector: "Consumer Discretionary" },
    { ticker: "BRK.B", freeFloatMarketCap: 400_000_000_000, sector: "Financials" }
  ]
};

describe("buildSnapshotRecords", () => {
  it("calculates weights and ordered constituents", () => {
    const { snapshot, constituents } = buildSnapshotRecords(samplePayload);

    expect(snapshot.as_of_date).toEqual("2025-09-19");
    expect(snapshot.tenant_id).toEqual(samplePayload.tenantId);
    expect(snapshot.source).toEqual("spdj");
    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);

    expect(constituents).toHaveLength(10);
    expect(constituents[0].ticker).toEqual("NVDA");
    expect(constituents[0].position).toEqual(1);
    expect(constituents[0].weight).toBeGreaterThan(constituents[1].weight);

    const totalWeight = constituents.reduce((acc, row) => acc + row.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it("enforces exactly 10 constituents", () => {
    const payload = { ...samplePayload, constituents: samplePayload.constituents.slice(0, 9) };
    expect(() => buildSnapshotRecords(payload)).toThrowError(/10 constituents/);
  });

  it("requires strictly positive free float market cap", () => {
    const payload = {
      ...samplePayload,
      constituents: [
        ...samplePayload.constituents.slice(0, 9),
        { ticker: "JPM", freeFloatMarketCap: 0, sector: "Financials" }
      ]
    };

    expect(() => buildSnapshotRecords(payload)).toThrowError(/free float market cap/);
  });
});
