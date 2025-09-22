# Index Universe Service Design

## 1. Overview & Scope
Index Universe Service (IUS) is responsible for discovering, persisting, and exposing the current and historical top 10 constituents of the S&P 500 index by free float market capitalization. The service executes nightly reconstitution jobs, validates vendor data, and publishes change events so downstream optimization and analytics services can react to constituent churn. IUS operates as a stateless Cloudflare Worker with bindings to Neon Postgres, Cloudflare R2, Cloudflare Queues, and Supabase Auth.

## 2. Responsibilities & Boundaries
- Own authoritative records for S&P 500 top 10 membership, weights, and metadata across effective dates.
- Ingest vendor payloads (S&P Dow Jones redistribution files, supplemental Polygon/IEX price snapshots) via Integration Gateway Service and validate schema, signatures, and effective timestamps.
- Provide APIs for current universe, historical snapshots, and on demand rebalance job triggers that align with compliance requirements.
- Emit immutable change events to Cloudflare Queues for Market Data Service (MDS), Portfolio Optimization Service (POS), and Spend Analytics Service (SAS) to refresh cached datasets.
- Do not compute portfolio metrics or risk; defer to POS and RSS. Do not manage user presentation logic; defer to Client Experience Service (CES).

## 3. Domain Model
### 3.1 Entities
- **UniverseSnapshot**: Represents the ordered list of constituents effective for a specific trading date and publication timestamp.
- **Constituent**: Symbol level information (ticker, CUSIP, ISIN, weight, free float market cap, sector).
- **ProviderFile**: Raw source payload reference stored in Cloudflare R2 along with checksum metadata.
- **RebalanceJob**: Async job metadata tracking ingestion runs, validation outcomes, and downstream event ids.

### 3.2 Neon Postgres Schema (ius)
All tables enforce Row Level Security with policies restricting access to rows where 	enant_id = auth.uid() or 	enant_id = 'global' and the caller possesses the portfolio.reader or portfolio.admin role. Staging tables use 	enant_id = 'global' and are read only to service accounts.

- universe_snapshots
  - snapshot_id UUID PRIMARY KEY
  - 	enant_id UUID NOT NULL
  - s_of_date DATE NOT NULL
  - effective_at TIMESTAMPTZ NOT NULL
  - published_at TIMESTAMPTZ NOT NULL
  - source VARCHAR(64) NOT NULL (enum values: spdj, manual_override)
  - hash VARCHAR(128) NOT NULL
  - status VARCHAR(16) NOT NULL DEFAULT 'active' (enum: ctive, superseded)
  - Indexes: (tenant_id, as_of_date DESC), unique (tenant_id, as_of_date, effective_at)

- universe_constituents
  - constituent_id UUID PRIMARY KEY
  - snapshot_id UUID REFERENCES universe_snapshots(snapshot_id) ON DELETE CASCADE
  - 	enant_id UUID NOT NULL
  - position SMALLINT CHECK (position BETWEEN 1 AND 10)
  - 	icker VARCHAR(12) NOT NULL
  - cusip CHAR(9)
  - isin CHAR(12)
  - ree_float_market_cap NUMERIC(20,2) NOT NULL
  - weight NUMERIC(7,5) NOT NULL CHECK (weight >= 0 AND weight <= 1)
  - sector VARCHAR(64)
  - currency CHAR(3) NOT NULL DEFAULT 'USD'
  - Constraints: unique (snapshot_id, position), unique (snapshot_id, ticker)

- ebalance_jobs
  - job_id UUID PRIMARY KEY
  - 	enant_id UUID NOT NULL
  - 	riggered_by UUID NOT NULL
  - equested_at TIMESTAMPTZ NOT NULL
  - effective_date DATE
  - status VARCHAR(16) NOT NULL (enum: queued, unning, succeeded, ailed)
  - error_code VARCHAR(32)
  - error_message TEXT
  - source VARCHAR(64) NOT NULL
  - queue_event_id VARCHAR(64)

### 3.3 Cloudflare R2 Buckets
- ius-provider-files: immutable vendor payloads, key format {tenant_id}/provider/{yyyymmdd}/sp500_top10.json. WORM lifecycle policy 5 years.
- ius-snapshots: serialized JSON snapshots for downstream bulk access, key format {tenant_id}/snapshots/{as_of_date}.json.

### 3.4 Event Contracts
Change events published to Cloudflare Queues 	opic-ius-universe using JSON schema:
`
{
  "event_type": "universe.rebalanced",
  "tenant_id": "uuid",
  "snapshot_id": "uuid",
  "as_of_date": "YYYY-MM-DD",
  "effective_at": "RFC3339",
  "constituents": [
    {"ticker": "AAPL", "weight": 0.11234, "position": 1 }
  ]
}
`
Events include idempotency key snapshot_id for replay safety.

## 4. API Contract Summary
| Method | Path | Purpose | AuthZ |
| --- | --- | --- | --- |
| GET | /universe/current | Return latest effective snapshot (optionally at a past as_of_date). | portfolio.viewer |
| GET | /universe/history | List snapshots over a date range with pagination. | portfolio.viewer |
| POST | /universe/rebalance-job | Trigger ingestion and validation workflow. | portfolio.admin |

Detailed OpenAPI contract provided separately in documents/IndexUniverseService_OpenAPI.yaml.

## 5. Data Flows
1. **Nightly Ingestion**: Temporal workflow in Integration Gateway Service fetches vendor file, uploads to R2, and posts ebalance command to IUS queue binding.
2. **Validation**: IUS Worker validates JSON schema, checks for top 10 tickers ordering by free float market cap, compares against previous snapshot to detect changes, and persists records in Neon within a transaction.
3. **Event Publication**: On successful commit, Worker emits universe.rebalanced event with diff summary and updates R2 snapshot artifact.
4. **On Demand Trigger**: API POST /universe/rebalance-job enqueues manual job (e.g., emergency correction). Execution path mirrors nightly ingestion but flags source = manual_override.

## 6. Security & Compliance
- Supabase Auth bearer tokens validated in middleware; JWKS keys cached for 5 minutes with rotation.
- Authorization via claims oles and 	enant_id; Durable Object maintains tenant policy cache. Deny by default.
- RLS ensures data isolation; service role ius_service bypasses row level policies only for internal ingestion transactions.
- All payloads signed with SHA256 and compared to vendor provided digest; mismatches cause job failure with alert to Engagement & Compliance Service.
- Audit trail: every API request logs requester id, tenant_id, snapshot_id, and diff hash into Neon udit_events and R2 append log.

## 7. Error Handling
- 400 Bad Request: malformed query params or validation errors.
- 401 Unauthorized: missing or invalid Supabase JWT.
- 403 Forbidden: caller lacks required role or tenant scope.
- 404 Not Found: requested snapshot not available for supplied date.
- 409 Conflict: concurrent rebalance job already in progress for tenant/date.
- 429 Too Many Requests: per-tenant limit 60 manual triggers per hour.
- 500 Internal Server Error: unexpected failures with correlation id propagated to logs.
Errors use standard problem format { "code": "string", "message": "human readable", "details": { ... } }.

## 8. Observability & Operations
- Metrics: ingest latency, validation failures, number of constituents deviating from previous snapshot, queue publish latency.
- Logs: structured JSON with 	race_id, 	enant_id, job_id, redacted secrets. Logs forwarded to Grafana Loki via Workers Logpush.
- Tracing: OpenTelemetry instrumentation for ingestion and API execution, exported to Grafana Tempo.
- Alerts: PagerDuty triggers on 3 consecutive job failures or stale snapshot age > 24 hours.
- Runbooks: stored in Backstage TechDocs referencing Terraform state for queue bindings and Neon credentials rotation.

## 9. Configuration & Deployment
- Environment variables managed via Terraform Cloud and synced to Cloudflare Workers secrets.
- Worker bindings: NEON_DB_URL, R2_PROVIDER, R2_SNAPSHOTS, QUEUE_REBALANCE, SUPABASE_JWKS_URL.
- Feature flags: LaunchDarkly integration toggles manual override capability per tenant.
- Testing: Vitest unit tests for validation logic, contract tests using Prism against OpenAPI, integration tests with ephemeral Neon branch and mock R2 in CI.

## 10. Runtime Configuration (Update)
- NEON_DATABASE_URL: Serverless Postgres connection string (Neon pooled branch). The Worker composes a connection pool lazily and reuses it across requests.
- SUPABASE_JWKS_URL: Supabase JWKS endpoint used to verify bearer tokens.
- Optional overrides:
  - SUPABASE_JWT_AUDIENCE (default uthenticated).
  - SUPABASE_JWT_ISSUER for stricter issuer validation.
- IUS_UNIVERSE_QUEUE: Cloudflare Queue binding receiving universe.rebalance.requested payloads.
- Queue payload schema mirrors the job service contract (jobId, 	enantId, effectiveDate, source, orce, equestedAt, queueEventId).
- Worker routes:
  - /health returns { status: "ok" } for uptime probes.
  - /universe/current, /universe/history, /universe/rebalance-job are mounted from the Hono app and require Supabase JWTs.
