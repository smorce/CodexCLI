# TopTenFrontier Architecture Specification

## 1. Executive Summary & Business Goals
TopTenFrontier は、S&P 500 の時価総額上位 10 銘柄を対象に効率的フロンティアとリスク分析を提供するエンタープライズ向け投資分析プラットフォームである。機関投資家および高度な個人投資家向けに、ポートフォリオ構築支援・ストレステスト・投資ガバナンス遵守を高速なエッジ配信で実現する。銘柄入れ替えに追随する構成銘柄管理、リスクパラメータの柔軟な変更、チーム単位のコラボレーションを支える監査証跡を備える。

プロダクトの主要ゴール:
- S&P 500 上位 10 銘柄情報を 5 分以内に最新化し、効率的フロンティアを即時に再計算できること。
- 投資委員会向けに監査可能なレポートおよび API を提供し、意思決定プロセスを標準化すること。
- グローバル拠点に向けた 6 大陸配信で、ユーザー体験を 200ms 未満のレイテンシで提供すること。

## 2. Non-Functional Requirements
- パフォーマンス: 主要 API (ポートフォリオ計算結果取得、構成銘柄取得) の p95 レイテンシ < 200ms (北米・欧州・アジア主要都市測定)。
- 可用性: 99.95% (月間ダウンタイム 21.6 分以下)。
- 目標復旧時間 (RTO): ≤ 60 分。自動フェイルオーバー + Terraform による IaC 復旧手順。
- 目標復旧時点 (RPO): ≤ 15 分。Neon ストリーミングレプリカ + オブジェクトストレージへの 5 分間隔 PITR スナップショット。
- データ保持: 監査ログ 5 年保存、マーケットデータ生データ 10 年、ユーザーポートフォリオ 7 年。
- セキュリティ: SOC 2 Type II 相当、PII を含むデータの暗号化 (静止時 AES-256、転送時 TLS 1.3)。
- スケーラビリティ: 10,000 アクティブユーザー、同時実行最適化ジョブ 100 件を想定。Workers Durable Objects + Neon オートスケールで対応。
- コンプライアンス: SEC/FINRA ガイドライン、GDPR、CCPA に準拠。

## 3. 全体アーキテクチャ
### 3.1 アーキテクチャ構成
- フロントエンド: Next.js (SSR) を OpenNext 経由で Cloudflare Workers にデプロイ。Cloudflare CDN/Images/R2/Zero Trust を活用。
- API ゲートウェイ: Cloudflare API Gateway + Cloudflare Access により、REST API を認証・レート制限・ルーティング。
- 同期通信: RESTful API (JSON) + OpenAPI 3.0.3 契約。Supabase Auth の JWT を用いたベアラートークン。
- 非同期通信: Cloudflare Queues でイベント駆動 (例: 銘柄リバランス通知、最適化完了通知)。Durable Objects でジョブ状態を管理。
- データベース: Neon (Serverless PostgreSQL)。各マイクロサービス毎に専用 Schema を作成し、RLS を厳格適用。
- ストレージ: Cloudflare R2 (レポート、キャッシュ済み最適化結果のバイナリ)。
- 分析: OptimizationService で Python ベースの最適化エンジンを Wasm 化したモジュールを実行 (Workers から呼び出し)。
- 監視・運用: Grafana Cloud + OpenTelemetry Collector を Workers/Next.js から送信、Logpush を BigQuery に転送。

### 3.2 マイクロサービス一覧とデータフロー
1. IndexConstituentService — S&P 500 銘柄情報の同期、上位 10 銘柄のトラッキング、履歴管理。
2. MarketDataService — 対象銘柄の価格・リターン・ボラティリティなどの時系列データを蓄積し、集約提供。
3. OptimizationService — 平均分散最適化・効率的フロンティア計算・制約評価を行い、ジョブと結果を管理。
4. PortfolioManagementService — ユーザーポートフォリオ、投資方針、レポート生成、共有ワークフローを管理。

主なデータフロー:
- IndexConstituentService が 5 分おきにマーケットデータプロバイダ (例: Polygon.io) から銘柄情報を取得し、変更イベントを Queue に発行。
- MarketDataService が変更イベントを購読し、対象銘柄の時系列データインポートジョブをキック。
- OptimizationService が MarketDataService の最新リターン系列を参照し、効率的フロンティアと推奨ポートフォリオを計算。完了イベントを Queue 経由で PortfolioManagementService に通知。
- PortfolioManagementService が完了イベントを受け取り、ユーザー固有のルールに基づく承認フローを更新し、Next.js アプリへ WebSocket (Cloudflare Pub/Sub) でリアルタイム通知。

### 3.3 データ分割とスキーマ戦略
- index_constituent schema: 銘柄メタデータ、ランク履歴、ベンチマーク情報。RLS は org_id + egion ベース。
- market_data schema: 日次/分足リターン、ベータ、セクター。RAW テーブルと集約テーブルに分割、CDC で R2 バックアップ。
- optimization schema: ジョブ、パラメータ、効率的フロンティア曲線 (離散 50 点) を JSONB で保存。
- portfolio schema: ユーザー定義ポートフォリオ、承認ログ、レポートストア (R2 URI を保存)。

### 3.4 レイテンシとキャッシュ
- Cloudflare CDN のエッジキャッシュで静的アセットを 1 時間 TTL。
- MarketDataService の最新集約結果は Cloudflare KV にキャッシュ (60 秒) し、p95 200ms を維持。
- Optimization 結果は 15 分間 R2 にキャッシュし、同一パラメータでの再計算を回避。

## 4. 各マイクロサービスの概要
### 4.1 IndexConstituentService
- 責務: S&P 500 銘柄リスト取得、上位 10 銘柄と順位履歴の管理、変更検出イベントの発行。
- 代表 API: GET /v1/constituents/top10, GET /v1/constituents/history, POST /v1/constituents/sync。
- データ連携: MarketDataService へ Queue イベント、PortfolioManagementService へ最新構成配信。

### 4.2 MarketDataService
- 責務: TOP10 銘柄の日次/分足価格データ取得、統計量 (期待リターン、標準偏差、相関) の計算、最適化リクエスト向けに提供。
- 代表 API: GET /v1/market-data/returns, GET /v1/market-data/covariance, POST /v1/market-data/ingest。
- データ連携: OptimizationService へ REST + Cache、IndexConstituentService からの更新イベント購読。

### 4.3 OptimizationService
- 責務: 平均分散最適化・効率的フロンティア生成・制約検証、結果の永続化および通知。
- 代表 API: POST /v1/optimization/jobs, GET /v1/optimization/jobs/{id}, GET /v1/optimization/frontier。
- データ連携: MarketDataService の統計量を取得、PortfolioManagementService へジョブ完了イベント送信。

### 4.4 PortfolioManagementService
- 責務: ユーザー・組織・役割管理、ポートフォリオ定義、承認フロー、レポート生成 (PDF/CSV)。
- 代表 API: POST /v1/portfolios, GET /v1/portfolios/{id}, POST /v1/portfolios/{id}/approve, GET /v1/reports/{id}。
- データ連携: Supabase Auth でユーザー同期、OptimizationService の結果を保存、Next.js への通知を管理。

## 5. 技術スタック
- フロントエンド: Next.js 15 (App Router), TypeScript, TailwindCSS, React Query。
- デプロイ: OpenNext + Cloudflare Workers、wrangler.jsonc で minify: true, 
ode_compat: true。
- API/Backend: Cloudflare Workers (Service Bindings), Durable Objects, Cloudflare Queues, Hono.js (Router)。
- データベース: Neon Serverless PostgreSQL、Prisma ORM (Data Proxy モード)。
- 認証/認可: Supabase Auth (JWT), Row Level Security, Access Policies。
- インフラ管理: Terraform + Atlantis (GitOps), GitHub Actions CI/CD。Secrets は Cloudflare KV + Supabase Vault。
- データ取得: 外部 API (Polygon.io / Alpha Vantage) 経由で REST Pull。回数制限のためのレートリミット + バックオフを実装。
- 数値計算: OptimizationService 内で Rust ベース数値計算ライブラリ (nalgebra) を Wasm ビルドし、Workers から呼び出す。
- 観測性: OpenTelemetry SDK (JS/Rust)、Grafana Cloud (Metrics/Logs/Traces)、Sentry (フロントエンド)

## 6. セキュリティ & コンプライアンス
- 認証: Supabase Auth で SSO (SAML/OIDC) と MFA を必須化。JWT に org_id, oles, isk_profile をクレーム付与。
- 認可: API Gateway + RLS。すべてのテーブルに user_id = auth.uid() または org_id ベースの RLS ポリシー。サービス間通信は mTLS (Cloudflare Tunnel)。
- データ保護: 静止データは Neon/KMS による AES-256、R2 には KMS-managed keys。転送時 TLS 1.3 / HTTP Strict Transport Security。
- ログ: 監査ログは BigQuery に 5 年保管、アクセスは RBAC で制限。PII のマスキングを Cloudflare Workers で実施。
- 入力検証: 全 API で JSON Schema validation。Rate limiting: 認証済み 600 rpm、匿名 0 rpm。
- コンプライアンス: SOC 2 Type II, GDPR, CCPA, SEC 17a-4(f) に準拠するため、WORM ストレージオプションを R2 + Object Lock で確保。

## 7. 運用 & パフォーマンス
- 観測性: OpenTelemetry Collector on Workers (via Workers Analytics Engine) → Grafana Cloud。SLI/SLO: レイテンシ、エラーレート、Queue 深度。
- CI/CD: GitHub Actions → Terraform Cloud → Cloudflare Deployments。PR ごとにプレビュー環境を自動作成。
- デプロイ戦略: Blue/Green (Workers) + Neon branching。DB マイグレーションは Prisma Migrate をリリース前に実行し、Feature Flag で切替。
- キャパシティ計画: Neon Autoscaling, Workers Unbound for heavy compute, Cloudflare Queues scaling。月次コストは < を目標に監視。
- アラート: PagerDuty 連携、SLO 達成率 99% 未満/Queue 深度 > 500/外部 API 連続失敗で緊急通知。
- バックアップ & DR: Neon PITR (5 min) + 日次完全バックアップを R2。Terraform state は Cloudflare R2 + Access。DR 演習を四半期に 1 回実施。
