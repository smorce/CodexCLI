# IndexFrontier Architecture Specification

## 1. Executive Summary & Business Goals
IndexFrontier delivers an enterprise-grade portfolio analytics platform that continuously monitors the S&P 500 universe, identifies the current top 10 constituents by free-float market capitalization, and computes efficient frontiers to support institutional portfolio managers, robo-advisors, and research teams. Core goals are to (a) refresh constituents and market data daily before U.S. market open, (b) generate optimized frontier curves under multiple constraint sets within 2 minutes of data availability, and (c) surface actionable insights and compliance-ready audit trails through APIs and dashboards.

## 2. Non-Functional Requirements
- Availability: 99.9% monthly for public APIs; optimization batch SLA 98% completion within 5 minutes of schedule.
- Latency: p95 < 250 ms for read endpoints, p95 < 500 ms for optimization job submissions at 200 RPS; WebSocket updates delivered < 1 s after optimization completion.
- Freshness: Constituent universe and prices refreshed at least every 15 minutes during trading hours; efficient frontier recomputed on constituent or price change with ≤ 2 minutes end-to-end lag.
- Security & Compliance: SOC 2 Type II readiness, SEC Regulation SCI alignment, GDPR/CCPA compliance; audit logs retained 7 years.
- Data Protection: RPO ≤ 10 minutes, RTO ≤ 30 minutes via Neon branching and R2 backups.
- Observability: 99% of optimization jobs traced with OpenTelemetry; anomaly alerts within 3 minutes.
- Scalability: Support 5x baseline tenant count (baseline 100 tenants) without re-architecture by horizontally scaling Workers and queue throughput.

## 3. Overall Architecture
- **Client & Edge Delivery**: Next.js 15 (App Router) deployed via OpenNext to Cloudflare Workers; real-time dashboards delivered via Server Components and Suspense streaming.
- **API Gateway**: Cloudflare API Gateway terminates TLS, enforces tenant-aware rate limits, and routes to service Workers. GraphQL BFF (via Yoga) exposes consolidated portfolio queries.
- **Services**:
  - MarketDataService Worker ingests S&P 500 constituent lists and intraday OHLCV quotes, persisting normalized data to Neon and caching hot symbols in Cloudflare KV.
  - PortfolioOptimizationService orchestrates mean-variance optimization jobs using Temporal Cloud workflows, invoking Python-based optimizers (PyPortfolioOpt) via Cloudflare Workers + WASM sandbox.
  - PortfolioInsightsService aggregates optimization outputs, scenario stress tests, and exposes reporting endpoints; pushes updates to clients via WebSockets (Workers Durable Objects).
- **Data Storage**: Neon Postgres logical databases per service (marketdata_db, optimization_db, insights_db). Historical market data >30 days archived to Cloudflare R2 (Parquet) and replicated to ClickHouse Cloud for analytics.
- **Data Pipeline**: Cloudflare Queues transports events (`constituents.updated`, `prices.snapshot`, `frontier.completed`). Temporal workflows manage optimization DAGs and recalculation triggers.
- **Identity & Access**: Supabase Auth for multi-tenant identity with SAML/SCIM support; role-based access (researcher, trader, auditor) evaluated via OPA policies.
- **Decision Log**:
  1. Adopt Cloudflare Workers + Neon to balance low-latency global delivery with transactional consistency for analytics metadata.
  2. Use Temporal for deterministic optimization scheduling, giving visibility into job retries and SLA tracking.
  3. Store historical pricing in Parquet on R2 + ClickHouse to reduce Postgres load and enable BI queries.

## 4. Microservices Overview
- **MarketDataService**: Tracks S&P 500 membership, selects top 10 constituents by free-float market cap, fetches quotes from Polygon.io and IEX Cloud, and publishes normalized price events.
- **PortfolioOptimizationService**: Runs constrained Markowitz optimizations (long-only, target return, max drawdown constraints) using up-to-date constituents, stores results, and emits `frontier.completed` events.
- **PortfolioInsightsService**: Serves dashboards and APIs for frontier curves, optimal weights, scenario analyses (Value at Risk, tracking error), and compliance audit logs.
- **Supporting Services**: Notification service (Slack/email alerts), Analytics ETL to ClickHouse, Compliance service to monitor strategy drift, Feature flag service for experimentation.

## 5. Technology Stack
- **Frontend & Edge**: Next.js 15, React 19, TypeScript 5, Tailwind CSS, Radix UI; deployed via OpenNext to Cloudflare Workers; `wrangler.jsonc` with `minify: true`.
- **Backend Services**: Cloudflare Workers (Typescript + Hono), GraphQL Yoga BFF, Temporal Workers via Workers + Durable Objects, Zod for schema validation.
- **Computation Layer**: WASM-compiled Python runtime (Pyodide) hosting PyPortfolioOpt & NumPy; `uv` orchestrates dependencies and packaging.
- **Data Layer**: Neon serverless Postgres (with vector extension for factor embeddings), Cloudflare KV for hot caches, Cloudflare R2 for Parquet archives, ClickHouse Cloud for analytical workloads.
- **Security**: Supabase Auth (JWT, SAML), OPA/Rego for ABAC, HashiCorp Vault for secret distribution, Cloudflare Zero Trust for admin endpoints.
- **Integrations**: Polygon.io + IEX Cloud for market data; FactSet optional integration via REST connectors; Slack + Email via SendGrid for notifications.
- **CI/CD**: GitHub Actions running `pnpm`+`uv` pipelines (lint, typecheck, unit tests, contract tests, WASM build, load test). Terraform Cloud manages infra (Cloudflare, Neon, ClickHouse, Temporal).

## 6. Security & Compliance
- **AuthN/AuthZ**: JWT validated at edge; tenant claim matched to `current_setting('app.tenant_id')`. Rego policies enforce role constraints (e.g., only auditors access full history).
- **Data Encryption**: TLS 1.3 everywhere; Neon & R2 AES-256 at rest. Sensitive integration keys stored in Vault with quarterly rotation.
- **RLS Policies**: Strict tenant isolation on all tables; auditors have read-only cross-tenant reporting views controlled via signed access tokens.
- **Audit & Monitoring**: Every optimization job emits audit events to dedicated `audit_log` schema; logs replicated nightly to R2 immutable bucket with 7-year retention. Datadog Cloud SIEM ingests Workers Logpush.
- **Input Validation**: Zod validates API inputs; scenario constraints checked for feasibility; Out-of-band integration payloads validated against JSON Schema.
- **Compliance**: DPIA artifacts maintained per tenant; vendor due diligence tracked in Control Center; high-risk changes require two-person approval documented in Temporal runs.

## 7. Operations & Performance
- **Observability**: OpenTelemetry traces exported to Honeycomb; metrics (job duration, queue lag, data freshness) stored in Prometheus-compatible Workers Analytics Engine; logs shipped to Datadog.
- **CI/CD**: GitHub Actions pipeline -> staged deploy with 10% canary for 15 minutes; automated rollback via wrangler release + Neon branch fallback.
- **Runtime Management**: Temporal schedules nightly backfill, intraday recalculations, and health checks. Feature flags managed via LaunchDarkly (edge evaluation).
- **Cost Optimization**: Batch historical data archival to R2 weekly; reuse WASM optimizer across tenants with caching of covariance matrices; autoscale Workers concurrency to keep spend within budget envelopes.
- **Support & On-Call**: 24/5 (trading days) pager rotation, 15-minute acknowledgement SLA; runbooks stored in OpsLevel. Synthetic monitoring of key workflows every 5 minutes.
- **Capacity Planning**: Quarterly load tests with k6 hitting 400 RPS; evaluate queue depth to maintain < 5 minute backlog under stress.
