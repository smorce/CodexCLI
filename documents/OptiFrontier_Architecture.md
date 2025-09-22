# OptiFrontier Architecture Specification

## 1. Executive Summary & Business Goals
- Deliver an enterprise-grade portfolio intelligence platform that continuously tracks the top 10 S&P 500 constituents by free-float market capitalization and empowers institutional clients to construct efficient frontier portfolios in real time.
- Automate end-of-day reconstitution so the optimization universe mirrors official S&P weightings within 30 minutes of index provider publication while preserving historical auditability.
- Provide quantitative research tooling, interactive dashboards, and APIs that let portfolio managers simulate risk-return trade-offs, policy constraints, and ESG overlays without exporting data to spreadsheets.
- Enable operations teams to govern compliance (e.g., Reg BI, SEC 206(4)-7) and client reporting workflows through a single multi-tenant experience with strong RBAC and lineage tracking.

## 2. Non-Functional Requirements
- **Performance:** p95 latency < 150 ms and p99 < 300 ms for read-heavy optimization result APIs via Cloudflare Workers; optimization jobs must complete < 8 seconds for 10-asset universes across 5,000 Monte Carlo simulations.
- **Availability:** 99.95% monthly availability SLO with multi-region Workers deployments (IAD, FRA) and dual-region Neon Postgres branches for transactional workloads.
- **Recovery Objectives:** RPO <= 10 minutes using continuous logical replication to standby branches; RTO <= 45 minutes through automated Terraform + OpenNext redeployments and runbooks for queue replay.
- **Data Freshness:** Market data latency <= 5 minutes post-official close; reference reconstitution jobs finish within 15 minutes of S&P rebalance announcements.
- **Security & Compliance:** SOC 2 Type II, ISO 27001, SEC cybersecurity guidance alignment; TLS 1.3 everywhere, AES-256 at rest, column-level masking for PII.
- **Observability:** 99% of user flows instrumented with tracing; anomaly alerts under 2 minutes mean-time-to-detect; optimization engines emit per-run metrics to Grafana with 1-minute resolution.
- **Cost Targets:** Keep steady-state unit cost < .002 per optimization request by leveraging Cloudflare free tiers, Neon autosuspend, and Snowflake auto-suspend warehouses.

## 3. 全体アーキテクチャ
- **Interaction Model:**
  - Public REST and GraphQL APIs through Cloudflare API Gateway with tenant-aware routing and WAF policies.
  - Asynchronous ingestion and optimization workflows coordinated via Cloudflare Queues and Temporal Cloud for long-running scenarios.
- **Edge & Experience Layer:** Next.js 15 (App Router) delivered through OpenNext on Cloudflare Workers; dynamic middleware enforces entitlements, feature flags, and locale-aware formatting.
- **Data & Analytics Fabric:**
  - Neon Postgres (primary OLTP) hosts configuration, entitlements, trades, and optimization runs with schema-per-tenant isolation.
  - Snowflake (OLAP) stores normalized price history, factor exposures, and derived analytics with dbt-managed transformations.
  - Cloudflare R2 retains raw vendor payloads and historical efficient frontier snapshots for compliance.
- **Market Data Integrations:** Integration Gateway Service consumes S&P Dow Jones Index redistribution feeds plus Polygon/IEX Cloud price APIs; data normalized to ISO 10383 MICs and ticker aliases.
- **Decision & Optimization Layer:** Portfolio Optimization Service executes mean-variance solvers, Black-Litterman tilt, and Monte Carlo stress tests leveraging WebAssembly-backed numerical kernels (wasm-bindgen) inside Workers.
- **Governance & Audit:** Immutable audit trail written to Neon udit_events and replicated to R2 with WORM configuration; data lineage tracked via OpenMetadata and surfaced in UI.

## 4. 各マイクロサービスの概要
1. **Index Universe Service (IUS)**
   - 責務: S&P 500 top 10 universe detection, constituent change auditing, and publication of effective dates.
   - 代表API: GET /universe/current, GET /universe/history, POST /universe/rebalance-job.
   - データ連携: Pulls nightly index provider files, validates vs historical holdings, emits change events to Cloudflare Queues.

2. **Market Data Service (MDS)**
   - 責務: Price, corporate action, and factor exposure ingestion; gap-filling and quality scoring.
   - 代表API: GET /prices, GET /factors, POST /ingestions.
   - データ連携: Streams vendor data into Snowflake staging, applies dbt transformations, pushes clean series to Neon for hot cache.

3. **Portfolio Optimization Service (POS)**
   - 責務: Mean-variance optimization, efficient frontier generation, constraint solving (max weight, turnover, ESG exclusions).
   - 代表API: POST /optimize, GET /frontiers/{runId}, POST /scenarios.
   - データ連携: Consumes market data snapshots from Snowflake, writes optimization results to Neon, emits metrics to OpenTelemetry.

4. **Risk & Scenario Service (RSS)**
   - 責務: Value-at-Risk, Expected Shortfall, factor stress, and backtesting analytics.
   - 代表API: POST /risk/var, POST /risk/backtests, GET /risk/reports/{id}.
   - データ連携: Leverages Snowflake warehouses, schedules Temporal workflows for rolling window analytics.

5. **Client Experience Service (CES)**
   - 責務: UI composition, report generation, and API façade for web/mobile channels.
   - 代表API: GET /dashboard, POST /reports, GET /reports/{id}.
   - データ連携: Queries Metrics API, renders PDF/Excel via Cloudflare Workers + WASM renderers, caches read models in Durable Objects.

6. **Identity & Entitlement Service (IES)**
   - 責務: Supabase Auth integration, SSO (SAML/OIDC), role-based access, and tenant policy enforcement.
   - 代表API: POST /tenants, POST /users/invite, POST /tokens/service.
   - データ連携: Synchronizes SCIM directories, applies RLS policies in Neon, issues signed JWTs for service-to-service access.

7. **Engagement & Compliance Service (ECS)**
   - 責務: Alerting, client notifications, compliance attestations, and archival exports.
   - 代表API: POST /alerts, GET /attestations, POST /exports.
   - データ連携: Consumes Queue events, integrates with Slack/Teams, emails via SendGrid, writes immutable artifacts to R2.

## 5. 技術スタック
- **フロントエンド:** Next.js 15 + TypeScript, ShadCN UI, TanStack Query; deployed via OpenNext to Cloudflare Workers with wrangler minify: true.
- **APIs:** Hono framework on Cloudflare Workers, OpenAPI first development, Durable Objects for session stickiness and per-tenant rate limiting.
- **Data Access:** Prisma ORM for Neon, Snowflake + dbt for analytics, DuckDB-in-WASM for client-side slicing.
- **Auth & Security:** Supabase Auth, OIDC enterprise SSO, JWT with audience scoping, Row Level Security enforcing 	enant_id = auth.uid() and role claims.
- **Computation:** Rust-based optimization engines compiled to WebAssembly, Temporal Cloud for orchestration, Cloudflare Queues for event distribution.
- **Storage & CDN:** Cloudflare R2 for vendor payloads, Cloudflare Images for chart exports, CDN caching for static assets via Cloudflare.
- **Payments & Billing:** Stripe Billing for tiered plans (Research, Enterprise) with usage metering on optimization runs.
- **Developer Tooling:** TurboRepo monorepo, Vitest + Playwright tests, GitHub Actions CI, Terraform Cloud for infrastructure, Snyk/Semgrep security scans.

## 6. セキュリティ & コンプライアンス
- **認証/認可:** Enforce MFA, device posture checks, conditional access; service tokens signed with rotating keys stored in Cloudflare Key Management.
- **データ保護:** Encrypt sensitive fields (client identifiers, account numbers) with envelope encryption; tokenize PII before analytics.
- **監査:** Append-only audit tables, tamper-evident hashes stored in R2; SOX/SEC audit exports generated on demand with immutable timestamps.
- **ネットワーク:** Cloudflare Zero Trust policies, mTLS for market data connectors, IP allowlists for admin APIs.
- **セキュリティ検査:** Automated SAST/DAST pipelines, quarterly red-team exercises, continuous dependency scanning.
- **ポリシー:** Policy-as-Code using Open Policy Agent; pre-deployment guardrails verify segregation-of-duties and data residency rules.

## 7. 運用 & パフォーマンス
- **Observability:** OpenTelemetry collectors push traces/metrics/logs to Grafana Cloud; Checkly synthetic monitors validate frontier calculations from major regions every 5 minutes.
- **CI/CD:** GitHub Actions -> staging -> canary (5%) -> production with automated rollback via Workers deployments; schema migrations managed through Prisma migrate with shadow databases.
- **Incident Response:** PagerDuty rotations, runbooks in Backstage TechDocs, automated client communications via ECS templates.
- **Cost Management:** Autosuspend Snowflake warehouses (after 2 min idle), Neon autoscaling, Frontier caching to reduce recomputation, storage lifecycle policies tier cold data to R2 infrequent access.
- **Data Governance:** Great Expectations validates ingestion quality, data catalog via OpenMetadata, lineage surfaces in CES and risk reports.
- **Roadmap:** Expand support to top 25 constituents, add ESG-adjusted frontier, integrate with portfolio accounting systems (Advent Geneva, BlackRock Aladdin) via IGS adapters.
