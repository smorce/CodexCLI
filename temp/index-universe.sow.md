# Statement of Work: Index Universe Service Implementation

## 1. Objective
Deliver the Index Universe Service (IUS) for OptiFrontier, implementing APIs and workflows that manage the S&P 500 top 10 constituent universe, aligned with `documents/OptiFrontier_Architecture.md`, `documents/IndexUniverseService_Design.md`, and `documents/IndexUniverseService_OpenAPI.yaml`.

## 2. In-Scope Deliverables
- Cloudflare Worker service implementing `/universe/current`, `/universe/history`, and `/universe/rebalance-job` endpoints per OpenAPI spec.
- Neon Postgres schema migrations for `ius.universe_snapshots`, `ius.universe_constituents`, and `ius.rebalance_jobs` with required constraints and RLS policies.
- Ingestion workflow logic (validation, persistence, event publication) covering nightly and manual triggers.
- Standardized error responses and audit/event logging as defined in the service design.
- Automated tests: unit tests for validation and persistence logic, contract tests against OpenAPI, integration tests using ephemeral Neon branch mocks.

## 3. Out of Scope
- Downstream services (MDS, POS, RSS) code changes beyond verifying event payload compatibility.
- UI/reporting layers in Client Experience Service.
- Production Terraform/infra provisioning (handled by platform team after service PR approval).

## 4. Assumptions & Dependencies
- Supabase Auth JWKS endpoint and tenant metadata available in shared configuration secrets.
- Integration Gateway provides validated vendor payloads in agreed JSON schema.
- Cloudflare Queue `topic-ius-universe` and R2 buckets (`ius-provider-files`, `ius-snapshots`) already provisioned or mocked for development.
- Access to Neon shadow branches for migration testing via Prisma or equivalent tooling.

## 5. Approach (TDD & Tidy First)
1. Prepare schema migration tests and failing unit tests for ingestion validation (Red).
2. Implement minimal code to satisfy tests sequentially (Green), starting with `/universe/current`, then `/universe/history`, then ingestion job.
3. Refactor for clarity and reuse after each green cycle, keeping structural refactors isolated (Refactor).
4. Maintain separate commits for structural tidy-ups versus behavior changes.

## 6. Test Strategy
- Unit: Validation rules, diff computation, and queue publisher using Vitest with mocks.
- Integration: Worker endpoint tests via Miniflare or Cloudflare local runtime, Neon test branch via Prisma.
- Contract: Prism or Dredd tests to ensure responses match OpenAPI schemas.
- Security: RLS policy enforcement tests ensuring tenant isolation.

## 7. Deliverables & Acceptance Criteria
- All endpoints return data matching OpenAPI schemas with correct authorization handling.
- Nightly ingestion simulation persists snapshots, emits events, and stores R2 artifacts.
- All automated tests pass in CI; linting and static analysis clean.
- Documentation updates: README/service docs covering env vars, runbooks references.
- Demo evidence showing efficient frontier downstream systems receive `universe.rebalanced` events.

## 8. Timeline & Effort Estimate
- Duration: 5 working days (planning/testing inclusive).
  - Day 1: Setup, migrations, validation unit tests.
  - Day 2: `/universe/current` + `/universe/history` endpoints (TDD).
  - Day 3: Rebalance job ingestion workflow, event emission.
  - Day 4: Integration/contract tests, RLS enforcement tests.
  - Day 5: Refactoring, documentation, final verification.

## 9. Risks & Mitigations
- Vendor feed schema drift -> implement schema versioning and fallbacks.
- Neon branch contention -> use isolated per-developer branches during CI.
- Queue delivery delays -> include idempotency keys and retries with exponential backoff.

## 10. Approval
Work will proceed once this SOW is approved.
