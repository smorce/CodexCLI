# AuroraProcure Architecture Specification

## 1. Executive Summary & Business Goals
- Provide a unified procurement cloud that lets Global 2000 enterprises digitize supplier onboarding, source-to-pay workflows, and sustainability compliance in a single multi-tenant platform.
- Reduce manual cycle time for sourcing events by 40% and mitigate supplier risk by continuously monitoring ESG, financial, and geopolitical signals.
- Deliver actionable spend analytics that help CFO and CPO offices unlock 8-12% cost savings through contract consolidation and demand forecasting.
- Offer extensible experience layers (web portal, APIs, ingestion pipelines) so that customers can integrate AuroraProcure with ERP suites (SAP S/4HANA, Oracle Fusion, NetSuite) and collaboration tools (Teams, Slack).

## 2. Non-Functional Requirements
- **Performance:** p95 latency < 200 ms and p99 < 350 ms for read-heavy REST endpoints served from Cloudflare Workers edge locations in North America and EMEA; background ingestion jobs must complete within 5 minutes for 1 GB payloads.
- **Availability & Resilience:** 99.95% monthly availability SLO; automated multi-region failover between primary (us-east-1) and secondary (eu-central-1) Neon Postgres branches; graceful degradation that keeps read APIs available during write outages.
- **Recovery Objectives:** RPO <= 15 minutes via continuous logical replication and point-in-time recovery in Neon; RTO <= 60 minutes through automated Terraform + OpenNext redeployments and database branch promotion runbooks.
- **Data Retention & Auditability:** Immutable audit logs retained for 5 years in Cloudflare R2 with WORM policies; configurable per-tenant data retention for transactional records (default 7 years) to satisfy SOX and local regulations.
- **Scalability:** Horizontally scale stateless microservices across Cloudflare Workers; auto-scale analytics workloads with Snowflake virtual warehouses (S size baseline, auto-suspend after 5 inactive minutes).
- **Security & Compliance:** SOC 2 Type II, ISO 27001, GDPR, CCPA, and optional FedRAMP Moderate alignment; end-to-end encryption (TLS 1.3 in transit, AES-256 at rest) with centralized key management via Cloudflare Keyless SSL.
- **Observability:** 99% of critical user journeys instrumented with distributed tracing (OpenTelemetry), golden dashboards with 1-minute resolution, alerting that routes Sev-1 incidents to 24/7 on-call within 2 minutes.
- **Cost Objectives:** Keep unit cost of transaction < $0.003 by maximizing Cloudflare free-tier quotas, Neon autosuspend, and tiered storage lifecycle policies.

## 3. 全体アーキテクチャ
- **Interaction Model:**
  - Synchronous REST/GraphQL APIs exposed via Cloudflare API Gateway and routed to service-specific Workers bindings.
  - Asynchronous domain events published to Cloudflare Queues (Kafka-compatible) and replicated into Snowflake and the data lake through streaming connectors.
- **Edge & Application Layer:** Next.js (SSR) deployed via OpenNext to Cloudflare Workers; middleware enforces tenant-aware routing, feature flags, and rate limiting (Redis-compatible Cloudflare KV + Durable Objects).
- **Service Mesh & Communication:** Each microservice is packaged as a dedicated Worker script with bindings for Neon, R2, Supabase Auth, and external SaaS connectors. Cross-service REST calls are minimized; instead, services subscribe to events through durable queues and push notifications through Webhooks.
- **Data Partitioning:** Multi-tenant Neon Postgres with schema-per-tenant for transactional workloads; shared dimension tables with tenant_id for global reference data; analytical workloads synced to Snowflake and S3-compatible R2 for long-term storage.
- **Integration Layer:** Managed webhooks and polling adapters handled by Integration Gateway Service; data ingested via secure Cloudflare Tunnels and normalized before persistence.
- **API Gateway/CDN:** Cloudflare CDN fronting all static assets, leveraging Workers for originless SSR, Image optimization, and caching of idempotent GET responses (60-second default TTL with tenant-aware cache keys).

## 4. 各マイクロサービスの概要
1. **Supplier Lifecycle Service (SLS)**
   - 責務: 取引先の登録、KYB/KYC検証、リスクスコア計算、ドキュメント管理。
   - 代表API: `POST /suppliers`, `GET /suppliers/{id}`, `POST /suppliers/{id}/risk-refresh`。
   - データ連携: Neonの`suppliers`、`supplier_documents`テーブル、Cloudflare R2のファイル格納、外部KYCプロバイダAPI。

2. **Procurement Workflow Service (PWS)**
   - 責務: ソーシングイベント、RFP/RFQ、入札管理、承認ワークフロー。
   - 代表API: `POST /events`, `POST /events/{id}/bids`, `POST /events/{id}/approve`。
   - データ連携: Neonの`events`、`bids`、`approvals`、Stripeサブスクリプション情報と連携して利用権限を制御。

3. **Contract Lifecycle Service (CLS)**
   - 責務: 契約テンプレート管理、電子署名連携、契約更新アラート。
   - 代表API: `POST /contracts`, `PATCH /contracts/{id}/status`, `GET /contracts/{id}/timeline`。
   - データ連携: Neonの`contracts`、Cloudflare R2に契約PDFを保管、DocuSign連携、イベント発火でPWSと統合。

4. **Compliance & Sustainability Service (CSS)**
   - 責務: ESGスコアリング、規制要件チェックリスト、証憑アップロード、違反検知。
   - 代表API: `GET /compliance/scorecards`, `POST /compliance/findings`, `POST /compliance/esg-sync`。
   - データ連携: 外部ESGデータソース ingestion、Snowflakeでのスコア計算結果同期、RLSでテナントごと制御。

5. **Spend Analytics Service (SAS)**
   - 責務: 取引データ集計、ダッシュボード供給、AIベース予測。
   - 代表API: `GET /analytics/spend`, `POST /analytics/forecast`, `GET /analytics/dashboards/{id}`。
   - データ連携: Snowflake + dbt変換レイヤ、Looker Studioコネクタ、イベントでPWSやCLSからデータ吸い上げ。

6. **Engagement & Notification Service (ENS)**
   - 責務: メール/Slack/Teams通知、アプリ内フィード、SLAエスカレーション。
   - 代表API: `POST /notifications`, `POST /subscriptions`, Webhook dispatcher。
   - データ連携: Cloudflare Queuesからイベントをサブスクライブし、SendGrid/Slack APIと連携。

7. **Integration Gateway Service (IGS)**
   - 責務: ERP (SAP, Oracle), AP automation, third-party riskシステムとのコネクタ管理。
   - 代表API: `POST /integrations/{system}/jobs`, `GET /integrations/{system}/status`。
   - データ連携: 外部SaaS API、SFTP ingestion、Neon staging schemaへの書き込み、イベント発行で他サービスに通知。

## 5. 技術スタック
- **フロントエンド & エッジアプリ:** Next.js 15 (App Router, Server Actions) + TypeScript、ShadCN UI、TanStack Query；OpenNextでCloudflare Workersへデプロイ。
- **API & サービス:** Cloudflare Workers (per-service bindings)、Honoフレームワーク、OpenAPIファースト実装、Durable Objectsで分散ロックとレート制限。
- **認証・認可:** Supabase AuthのJWTと多要素認証、SCIMプロビジョニング、Row Level SecurityをNeonと統合。
- **データ:** Neon Serverless Postgres (primary OLTP)、Prisma ORM、Snowflake (OLAP)、Cloudflare R2 (バイナリ)、Cloudflare KV / Durable Objects (キャッシュ & セッション)。
- **イベント & バッチ:** Cloudflare Queues、Supabase Functions for reactive triggers、Temporal Cloud (長時間ワークフロー) をIGSで利用。
- **決済:** Stripe Billing + Taxでマルチプラン (Starter/Enterprise) 課金、Usage-basedメータリングはStripe Metered Billing。
- **CI/CD:** GitHub Actions + OpenNext build、Terraform Cloudでインフラ宣言、自動セキュリティスキャン (Snyk, Trivy)。
- **開発者体験:** TurboRepoでモノレポ管理、Vitest+Playwright、Backstage開発者ポータル。

## 6. セキュリティ & コンプライアンス
- **認証/認可:** OIDC SSO (Azure AD, Okta)、SCIMでユーザー/グループ同期、Supabase Auth JWTをWorkersで検証し、Prisma middlewareでテナント境界を enforce。
- **データ保護:** AES-256暗号化、PIIフィールドはPGPで二重暗号化、フィールドレベルマスキングをSnowflakeで適用。
- **ネットワーク:** Cloudflare Zero Trustポリシー、mTLS for outbound connectors、IP allowlist for admin APIs。
- **RLSポリシー:** すべてのテーブルで`tenant_id = auth.uid()`等のコンテキストを利用し、サービス間トークンはSigned JWT (audience限定) を使用。
- **監査:** すべてのAPI呼び出しをNeonの`audit_logs`テーブルとR2 WORMストレージに二重書き込み、Audit APIで外部SOARと連携。
- **セキュリティテスト:** 静的解析 (Semgrep), 動的スキャン (OWASP ZAP automation), 定期ペネトレーションテスト (年2回)。
- **コンプライアンス:** ポリシーベース設定 (Policy-as-Code using Open Policy Agent) をCIで検証、証跡生成を自動化し監査対応時間を50%削減。

## 7. 運用 & パフォーマンス
- **観測性:** OpenTelemetry collector on Workers KV export -> Grafana Cloud、Tail sampling, Trace-based alerts、Synthetic monitoring (Checkly) でリージョン別SLO検証。
- **CI/CD & リリース:** GitHub Actionsで3段階パイプライン (lint/test -> staging deploy -> canary release)、OpenNext Canary routes (5%) を24時間観測して本番昇格。
- **インシデント対応:** PagerDutyでエスカレーション、RunbookはBackstage TechDocsに集約。自動ロールバック (Workers Deployments rollback API) を活用。
- **コスト最適化:** Neon autosuspend (idle 5分)、Cloudflare Imagesでオンデマンド変換、Snowflake auto-suspend/auto-resume、dbt incremental models。
- **データガバナンス:** Data Catalog (Alation) 連携、PII検出をGreat Expectationsで検証、データ品質メトリクスをSASに提供。
- **将来ロードマップ:** Embedded analytics SDK、サプライヤーポータルのAIアシスタント、L2支払いファイナンス連携を次期フェーズで検討。


