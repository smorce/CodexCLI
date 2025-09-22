# Statement of Work: Market Data Service Implementation

## 1. Objective
Implement the Market Data Service (MDS) according to `documents/OptiFrontier_Architecture.md`, `documents/MarketDataService_Design.md`, and `documents/MarketDataService_OpenAPI.yaml`, delivering APIs and ingestion workflows aligned with OptiFrontier’s TDD and Tidy First principles.

## 2. Scope
- Cloudflare Worker service exposing `/prices`, `/prices/latest`, `/factors`, `/corporate-actions`, `/ingestions/jobs`, `/ingestions/jobs/{jobId}` per OpenAPI spec.
- Neon Postgres schema setup (`mds.price_snapshots`, `mds.prices`, `mds.factors`, `mds.corporate_actions`, `mds.ingestion_jobs`) with RLS policies.
- Ingestion pipeline logic: validation, persistence, queue publication, duplicate detection for price snapshots.
- Queue producer integration emitting `marketdata.ingested` events.
- Supabase Auth validation and tenant isolation.
- Comprehensive automated tests (unit, integration with pg-mem, contract tests, Worker integration) executed via Vitest.

## 3. Out of Scope
- Snowflake export routines beyond event publication.
- Vendor-specific adapters (Integration Gateway handles raw ingestion).
- UI/reporting deliverables.

## 4. Assumptions
- JWKS endpoint, queue bindings, and Neon URLs supplied via environment configuration.
- Integration Gateway produces normalized JSON conforming to agreed schema.
- Downstream services subscribe to `marketdata.ingested` events and handle idempotency keys.

## 5. Approach (TDD & Tidy First)
1. Establish migration scripts and repository tests (Red/Green/Refactor).
2. Implement read APIs sequentially under TDD.
3. Build ingestion job logic with queue emission and duplicate guards.
4. Integrate Worker entrypoint with dependency injection mirroring Index Universe patterns.
5. Maintain clean separation between structural refactors and behavior changes.

## 6. Test Plan
- Unit: validation schemas, repository helpers, job service.
- Integration: Worker endpoint tests (Miniflare) with seeded Neon data.
- Contract: Ajv-driven schema assertions against OpenAPI responses.
- Security: RLS enforcement tests verifying cross-tenant isolation.

## 7. Deliverables
- Source code implementing MDS Worker and support modules.
- SQL migration artifacts under `src/mds/sql`.
- Test suite with 100% coverage of core paths.
- Documentation updates covering env variables, queue contracts, runbooks.

## 8. Timeline
- Day 1-2: Schema migrations, repository & validation tests.
- Day 3: Read API endpoints.
- Day 4: Ingestion workflow + queue integration.
- Day 5: Integration tests, documentation, polish.

## 9. Risks & Mitigations
- Vendor schema drift → enforce versioned validation & feature flags.
- Queue delivery delays → include retries/idempotency keys.
- Data volume growth → plan for Snowflake offload and partitioning in future sprints.

## 10. Approval
Development proceeds after sign-off on this SOW.
