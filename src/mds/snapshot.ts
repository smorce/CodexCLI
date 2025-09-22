import type { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";

const priceSchema = z.object({
  ticker: z.string().regex(/^[A-Z.]{1,12}$/),
  mic: z.string().min(1),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number(),
  volume: z.number().optional(),
  currency: z.string().length(3).optional(),
});

const factorSchema = z.object({
  ticker: z.string().regex(/^[A-Z.]{1,12}$/),
  factorName: z.string().min(1),
  value: z.number(),
});

const inputSchema = z.object({
  tenantId: z.string().uuid(),
  asOfDate: z.string().regex(/\d{4}-\d{2}-\d{2}/),
  vendor: z.enum(["spdj", "polygon", "iex"]),
  publishedAt: z.string().datetime(),
  prices: z.array(priceSchema).min(1, "prices must contain at least one price"),
  factors: z.array(factorSchema).default([]),
});

export type BuildPriceSnapshotInput = z.infer<typeof inputSchema>;

export interface PriceSnapshotRecord {
  snapshot_id: string;
  tenant_id: string;
  as_of_date: string;
  vendor: string;
  published_at: string;
  hash: string;
  status: "active" | "superseded";
}

export interface PriceRecord {
  price_id: string;
  snapshot_id: string;
  tenant_id: string;
  ticker: string;
  mic: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  currency: string;
}

export interface FactorRecord {
  factor_id: string;
  snapshot_id: string;
  tenant_id: string;
  ticker: string;
  factor_name: string;
  value: number;
  as_of_date: string;
}

export interface PriceSnapshotAggregate {
  snapshot: PriceSnapshotRecord;
  prices: PriceRecord[];
  factors: FactorRecord[];
}

export function buildPriceSnapshot(input: BuildPriceSnapshotInput): PriceSnapshotAggregate {
  const parsed = inputSchema.parse(input);
  const snapshotId = randomUUID();

  const prices: PriceRecord[] = parsed.prices.map((row) => ({
    price_id: randomUUID(),
    snapshot_id: snapshotId,
    tenant_id: parsed.tenantId,
    ticker: row.ticker,
    mic: row.mic,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    currency: row.currency ?? "USD",
  }));

  const factors: FactorRecord[] = parsed.factors.map((factor) => ({
    factor_id: randomUUID(),
    snapshot_id: snapshotId,
    tenant_id: parsed.tenantId,
    ticker: factor.ticker,
    factor_name: factor.factorName,
    value: factor.value,
    as_of_date: parsed.asOfDate,
  }));

  const hash = createHash("sha256")
    .update(
      JSON.stringify(
        prices.map((row) => ({ ticker: row.ticker, close: row.close, mic: row.mic })),
      ),
    )
    .digest("hex");

  const snapshot: PriceSnapshotRecord = {
    snapshot_id: snapshotId,
    tenant_id: parsed.tenantId,
    as_of_date: parsed.asOfDate,
    vendor: parsed.vendor,
    published_at: parsed.publishedAt,
    hash,
    status: "active",
  };

  return {
    snapshot,
    prices,
    factors,
  };
}
