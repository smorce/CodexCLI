# Market Data Service Design

## 1. Overview & Responsibility
Market Data Service (MDS) ingests, normalizes, and serves market data required by OptiFrontier’s portfolio and risk engines. It orchestrates ingestion from S&P Dow Jones feeds (top 10 constituents), price vendors (Polygon/IEX), factor datasets, and corporate actions. MDS exposes APIs that deliver validated price and factor time series, manages intraday cache, and publishes cleansing results to downstream consumers (Portfolio Optimization Service, Risk Scenario Service, Spend Analytics Service). The service runs as a Cloudflare Worker with bindings to Neon Postgres, Snowflake pipelines (via Integration Gateway), Cloudflare R2 for raw payloads, and Supabase Auth for tenant isolation.

## 2. Boundaries
- Owns ingestion workflows for equity prices, corporate actions, factor exposures for the tracked universe (S&P 500 top 10) plus historical constituents to maintain continuity.
- Provides read APIs for normalized OHLCV, corporate actions, factor data, and ingestion job status.
- Emits events (`marketdata.ingested`) to Cloudflare Queues when new snapshots become available.
- Does not compute risk metrics (delegated to RSS) or optimization outputs (POS). Does not render UI artifacts (CES responsibility).

## 3. Data Model & Storage (Neon schema `mds`)
### Tables
- `price_snapshots`
  - `snapshot_id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `as_of_date DATE NOT NULL`
  - `vendor TEXT NOT NULL`
  - `published_at TIMESTAMPTZ NOT NULL`
  - `source_file TEXT`
  - `status TEXT NOT NULL DEFAULT 'active'` (enum: `active`, `superseded`, `error`)
  - `hash TEXT NOT NULL`
  - Unique `(tenant_id, as_of_date, vendor)`

- `prices`
  - `price_id UUID PRIMARY KEY`
  - `snapshot_id UUID REFERENCES price_snapshots(snapshot_id) ON DELETE CASCADE`
  - `tenant_id UUID NOT NULL`
  - `ticker TEXT NOT NULL`
  - `mic TEXT NOT NULL`
  - `open NUMERIC(18,6)`
  - `high NUMERIC(18,6)`
  - `low NUMERIC(18,6)`
  - `close NUMERIC(18,6)`
  - `volume NUMERIC(20,0)`
  - `currency CHAR(3) NOT NULL DEFAULT 'USD'`
  - Unique `(snapshot_id, ticker)`

- `factors`
  - `factor_id UUID PRIMARY KEY`
  - `snapshot_id UUID REFERENCES price_snapshots(snapshot_id) ON DELETE CASCADE`
  - `tenant_id UUID NOT NULL`
  - `ticker TEXT NOT NULL`
  - `factor_name TEXT NOT NULL`
  - `value NUMERIC(16,8) NOT NULL`
  - `as_of_date DATE NOT NULL`
  - Unique `(snapshot_id, ticker, factor_name)`

- `corporate_actions`
  - `event_id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `ticker TEXT NOT NULL`
  - `event_type TEXT NOT NULL` (split, dividend, merger, symbol_change)
  - `effective_date DATE NOT NULL`
  - `details JSONB NOT NULL`
  - `recorded_at TIMESTAMPTZ NOT NULL`
  - Unique `(tenant_id, ticker, event_type, effective_date)`

- `ingestion_jobs`
  - `job_id UUID PRIMARY KEY`
  - `tenant_id UUID NOT NULL`
  - `source TEXT NOT NULL`
  - `requested_at TIMESTAMPTZ NOT NULL`
  - `status TEXT NOT NULL` (enum `queued`, `running`, `succeeded`, `failed`)
  - `error_code TEXT`
  - `error_message TEXT`
  - `queue_event_id TEXT`
  - `payload JSONB`

All tables enforce RLS: `tenant_id = auth.uid()` or service role; `price_snapshots` and `prices` allow read to `portfolio.viewer` and write to internal ingestion role.

Cloudflare R2 buckets:
- `mds-raw-vendor`: raw files keyed `{tenant_id}/{vendor}/{YYYYMMDD}/{filename}` (WORM 5 years).
- `mds-curated-prices`: parquet snapshot exports for analytics.

Events to Queue `topic-mds-ingestions` with payload `{ eventType: 'marketdata.ingested', tenantId, snapshotId, asOfDate, vendor }`.

## 4. APIs
| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| GET | /prices | Time-series prices (supports date range, tickers). | `portfolio.viewer` |
| GET | /prices/latest | Latest price snapshot for current universe. | `portfolio.viewer` |
| GET | /factors | Factor exposures by name/ticker/date. | `portfolio.viewer` |
| GET | /corporate-actions | Corporate action events filterable by ticker/date/type. | `portfolio.viewer` |
| POST | /ingestions/jobs | Trigger or replay ingestion job. | `portfolio.admin` |
| GET | /ingestions/jobs/{jobId} | Fetch job status. | `portfolio.viewer` (tenant-scoped) |

Standard errors follow `{ code, message, details }`.

## 5. External Integrations
- **Integration Gateway Service**: Handles pulling vendor feeds, pushes to MDS ingestion queue.
- **Portfolio Optimization Service**: Calls `/prices/latest` and `/factors` for frontier calculations.
- **Risk & Scenario Service**: Pulls `/prices` historical windows and corporate actions for backtests.
- **Snowflake Sync**: Completed snapshots are copied to Snowflake via Snowpipe triggered by R2 upload.

## 6. Security & Compliance
- Supabase Auth JWT mandatory; tokens validated via JWKS cached for 5 minutes.
- Authorization via role claims `portfolio.viewer` and `portfolio.admin`; ingestion endpoints restricted to admin/service tokens.
- Input validation via Zod: enforce ticker format, date bounds (<= current date), vendor allowlist.
- All payload writes audited to `mds.audit_events` (future table) and Cloudflare Logpush.

## 7. Observability & Operations
- Metrics: ingestion duration, rows ingested per feed, validation failure counts, API p95 latency.
- Logs: structured JSON with `tenantId`, `jobId`, `snapshotId`, redacted tokens.
- Alerts: queue lag > 5m, ingestion failures, API error rate > 1%.
- Runbooks for vendor schema drift, backfills, queue replay.

## 8. Testing Strategy
- Unit tests: validation schemas, diffing, queue producer.
- Integration tests: in-memory Postgres (pg-mem) for repository, contract tests vs OpenAPI using Ajv.
- End-to-end tests: Miniflare-based Worker invoking `/prices` with seeded data.

## 9. Deployment Notes
- Worker bindings required: `NEON_DATABASE_URL`, `SUPABASE_JWKS_URL`, optional Supabase overrides, `MDS_PRICES_QUEUE`, `MDS_VENDOR_QUEUE` (for job triggers), R2 buckets, environment-specific log sinks.
- Migration `src/ius/sql` equivalences will be mirrored under `src/mds/sql` when implemented.
