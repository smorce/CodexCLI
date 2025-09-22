import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const constituentInputSchema = z.object({
  ticker: z.string().regex(/^[A-Z.]{1,10}$/),
  freeFloatMarketCap: z.number().positive({ message: "free float market cap must be > 0" }),
  sector: z.string().min(1).optional(),
  cusip: z.string().length(9).optional(),
  isin: z.string().length(12).optional(),
  currency: z.string().length(3).optional(),
});

const snapshotInputSchema = z.object({
  tenantId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  source: z.enum(["spdj", "manual_override"]),
  constituents: z
    .array(constituentInputSchema)
    .length(10, { message: "Payload must include exactly 10 constituents" }),
});

export type BuildSnapshotInput = z.infer<typeof snapshotInputSchema>;

export interface UniverseSnapshotRecord {
  snapshot_id: string;
  tenant_id: string;
  as_of_date: string;
  effective_at: string;
  published_at: string;
  source: "spdj" | "manual_override";
  hash: string;
  status: "active" | "superseded";
}

export interface UniverseConstituentRecord {
  constituent_id: string;
  snapshot_id: string;
  tenant_id: string;
  position: number;
  ticker: string;
  cusip?: string;
  isin?: string;
  free_float_market_cap: number;
  weight: number;
  sector?: string;
  currency: string;
}

export interface SnapshotRecords {
  snapshot: UniverseSnapshotRecord;
  constituents: UniverseConstituentRecord[];
}

export function buildSnapshotRecords(input: BuildSnapshotInput): SnapshotRecords {
  const parsed = snapshotInputSchema.parse(input);
  const sorted = [...parsed.constituents].sort((a, b) => b.freeFloatMarketCap - a.freeFloatMarketCap);

  const totalCap = sorted.reduce((sum, item) => sum + item.freeFloatMarketCap, 0);
  if (totalCap <= 0) {
    throw new Error("Aggregated free float market cap must be > 0");
  }

  const snapshotId = randomUUID();

  const constituents: UniverseConstituentRecord[] = sorted.map((item, index) => {
    if (item.freeFloatMarketCap <= 0) {
      throw new Error("Each constituent must have free float market cap > 0");
    }

    const weight = item.freeFloatMarketCap / totalCap;

    return {
      constituent_id: randomUUID(),
      snapshot_id: snapshotId,
      tenant_id: parsed.tenantId,
      position: index + 1,
      ticker: item.ticker,
      cusip: item.cusip,
      isin: item.isin,
      free_float_market_cap: item.freeFloatMarketCap,
      weight,
      sector: item.sector,
      currency: item.currency ?? "USD",
    } satisfies UniverseConstituentRecord;
  });

  const hash = createHash("sha256")
    .update(JSON.stringify(constituents.map((c) => ({ ticker: c.ticker, weight: Number(c.weight.toFixed(10)) }))))
    .digest("hex");

  const snapshot: UniverseSnapshotRecord = {
    snapshot_id: snapshotId,
    tenant_id: parsed.tenantId,
    as_of_date: parsed.asOfDate,
    effective_at: parsed.effectiveAt,
    published_at: parsed.publishedAt,
    source: parsed.source,
    hash,
    status: "active",
  };

  return { snapshot, constituents };
}
