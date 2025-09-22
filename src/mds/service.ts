import type {
  CorporateActionRow,
  FactorSeriesRow,
  PriceRepository,
  PriceSeriesRow,
} from "./repository";

export interface CreatePriceApiDeps {
  priceRepo: PriceRepository;
}

export interface PriceApi {
  getLatestPrices(input: { tenantId: string; vendor: string; asOfDate?: string }): Promise<PriceApiResult>;
  getPriceSeries(input: {
    tenantId: string;
    vendor: string;
    tickers?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<PriceSeriesResult>;
  getFactorSeries(input: {
    tenantId: string;
    vendor: string;
    tickers?: string[];
    factorNames?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<FactorSeriesResult>;
  listCorporateActions(input: {
    tenantId: string;
    tickers?: string[];
    startDate?: string;
    endDate?: string;
    eventTypes?: string[];
  }): Promise<CorporateActionResult>;
}

export interface PriceApiResult {
  snapshot: {
    snapshot_id: string;
    tenant_id: string;
    as_of_date: string;
    vendor: string;
    published_at: string;
    hash: string;
  };
  prices: Array<{
    ticker: string;
    mic: string;
    close: number;
    currency: string;
  }>;
  factors: Array<{
    ticker: string;
    factor_name: string;
    value: number;
  }>;
}

export interface PriceSeriesResult {
  items: Array<{
    asOfDate: string;
    ticker: string;
    mic: string;
    close: number;
    volume?: number | null;
    currency: string;
    vendor: string;
  }>;
}

export interface FactorSeriesResult {
  items: Array<{
    asOfDate: string;
    ticker: string;
    factorName: string;
    value: number;
    vendor: string;
  }>;
}

export interface CorporateActionResult {
  items: Array<{
    eventId: string;
    ticker: string;
    eventType: string;
    effectiveDate: string;
    recordedAt: string;
    details: unknown;
  }>;
}

function normalizeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapLatest(raw: Awaited<ReturnType<PriceRepository["getLatestSnapshot"]>>): PriceApiResult {
  if (!raw) {
    throw new Error("snapshot_not_found");
  }

  return {
    snapshot: {
      snapshot_id: raw.snapshot.snapshot_id,
      tenant_id: raw.snapshot.tenant_id,
      as_of_date: raw.snapshot.as_of_date,
      vendor: raw.snapshot.vendor,
      published_at: raw.snapshot.published_at,
      hash: raw.snapshot.hash,
    },
    prices: raw.prices.map((p) => ({
      ticker: p.ticker,
      mic: p.mic,
      close: Number(p.close),
      currency: p.currency,
    })),
    factors: raw.factors.map((f) => ({
      ticker: f.ticker,
      factor_name: f.factor_name,
      value: Number(f.value),
    })),
  };
}

function mapSeries(rows: PriceSeriesRow[]): PriceSeriesResult {
  return {
    items: rows.map((row) => ({
      asOfDate: normalizeDate(row.as_of_date),
      ticker: row.ticker,
      mic: row.mic,
      close: Number(row.close),
      volume: row.volume,
      currency: row.currency,
      vendor: row.vendor,
    })),
  };
}

function mapFactorSeries(rows: FactorSeriesRow[]): FactorSeriesResult {
  return {
    items: rows.map((row) => ({
      asOfDate: normalizeDate(row.as_of_date),
      ticker: row.ticker,
      factorName: row.factor_name,
      value: Number(row.value),
      vendor: row.vendor,
    })),
  };
}

function mapCorporateActions(rows: CorporateActionRow[]): CorporateActionResult {
  return {
    items: rows.map((row) => ({
      eventId: row.event_id,
      ticker: row.ticker,
      eventType: row.event_type,
      effectiveDate: normalizeDate(row.effective_date),
      recordedAt: normalizeTimestamp(row.recorded_at),
      details: row.details,
    })),
  };
}

export function createPriceApi({ priceRepo }: CreatePriceApiDeps): PriceApi {
  return {
    async getLatestPrices({ tenantId, vendor, asOfDate }) {
      const raw = await priceRepo.getLatestSnapshot(tenantId, vendor, asOfDate);
      return mapLatest(raw);
    },
    async getPriceSeries({ tenantId, vendor, tickers, startDate, endDate }) {
      const rows = await priceRepo.getPriceSeries(tenantId, vendor, { tickers, startDate, endDate });
      return mapSeries(rows);
    },
    async getFactorSeries({ tenantId, vendor, tickers, factorNames, startDate, endDate }) {
      const rows = await priceRepo.getFactorSeries(tenantId, vendor, { tickers, factorNames, startDate, endDate });
      return mapFactorSeries(rows);
    },
    async listCorporateActions({ tenantId, tickers, startDate, endDate, eventTypes }) {
      const rows = await priceRepo.listCorporateActions(tenantId, { tickers, startDate, endDate, eventTypes });
      return mapCorporateActions(rows);
    },
  };
}
