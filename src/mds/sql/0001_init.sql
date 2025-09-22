CREATE SCHEMA IF NOT EXISTS mds;

CREATE TABLE IF NOT EXISTS mds.price_snapshots (
    snapshot_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    as_of_date DATE NOT NULL,
    vendor TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','error')),
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, as_of_date, vendor)
);

CREATE TABLE IF NOT EXISTS mds.prices (
    price_id UUID PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES mds.price_snapshots(snapshot_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    ticker TEXT NOT NULL,
    mic TEXT NOT NULL,
    open NUMERIC(18,6),
    high NUMERIC(18,6),
    low NUMERIC(18,6),
    close NUMERIC(18,6) NOT NULL,
    volume NUMERIC(20,0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(snapshot_id, ticker)
);

CREATE TABLE IF NOT EXISTS mds.factors (
    factor_id UUID PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES mds.price_snapshots(snapshot_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    ticker TEXT NOT NULL,
    factor_name TEXT NOT NULL,
    value NUMERIC(16,8) NOT NULL,
    as_of_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(snapshot_id, ticker, factor_name)
);

CREATE TABLE IF NOT EXISTS mds.corporate_actions (
    event_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ticker TEXT NOT NULL,
    event_type TEXT NOT NULL,
    effective_date DATE NOT NULL,
    details JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, ticker, event_type, effective_date)
);

CREATE TABLE IF NOT EXISTS mds.ingestion_jobs (
    job_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    source TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
    error_code TEXT,
    error_message TEXT,
    queue_event_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prices_snapshot_idx ON mds.prices(snapshot_id, ticker);
CREATE INDEX IF NOT EXISTS factors_snapshot_idx ON mds.factors(snapshot_id, factor_name);
CREATE INDEX IF NOT EXISTS corporate_actions_ticker_idx ON mds.corporate_actions(tenant_id, ticker, effective_date);

-- RLS policies will be applied in production migrations via Supabase.
