CREATE SCHEMA IF NOT EXISTS ius;

CREATE TABLE IF NOT EXISTS ius.universe_snapshots (
    snapshot_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    as_of_date DATE NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('spdj', 'manual_override')),
    hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS universe_snapshots_tenant_asof_idx
    ON ius.universe_snapshots (tenant_id, as_of_date DESC, effective_at DESC);

CREATE TABLE IF NOT EXISTS ius.universe_constituents (
    constituent_id UUID PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES ius.universe_snapshots(snapshot_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 10),
    ticker TEXT NOT NULL,
    cusip TEXT,
    isin TEXT,
    free_float_market_cap NUMERIC(20,2) NOT NULL CHECK (free_float_market_cap > 0),
    weight NUMERIC(18,10) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    sector TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(snapshot_id, position),
    UNIQUE(snapshot_id, ticker)
);

CREATE INDEX IF NOT EXISTS universe_constituents_snapshot_idx
    ON ius.universe_constituents (snapshot_id, position);

CREATE TABLE IF NOT EXISTS ius.rebalance_jobs (
    job_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    triggered_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    effective_date DATE,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    error_code TEXT,
    error_message TEXT,
    source TEXT NOT NULL,
    queue_event_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ius.universe_snapshots IS 'Top 10 S&P 500 universe snapshots (TENANT SCOPED).';
COMMENT ON TABLE ius.universe_constituents IS 'Constituent rows tied to snapshots.';
COMMENT ON TABLE ius.rebalance_jobs IS 'Audit trail of ingestion job executions.';

-- RLS policies applied in production via Supabase; omitted in local test harness.
