# SPTop10Frontier アーキテクチャ仕様書

## 1. Executive Summary & Business Goals
- S&P500 指数の上位10銘柄を対象としたポートフォリオ最適化と効率的フロンティア分析を提供するエンタープライズ向け SaaS プラットフォームを構築する。
- 日次で入れ替わり得る指数構成銘柄に追従し、金融アナリストとウェルス・マネージャーが最新データに基づく投資判断を迅速に行えるよう支援する。
- 企業顧客向けに監査可能な運用・可観測性・セキュリティ基準を満たし、API とエッジ最適化 UI を通じてマルチチャネル展開を実現する。

## 2. Non-Functional Requirements
- 可用性: 年間 99.95% 以上 (月間許容ダウンタイム ≤ 21.6 分)。
- パフォーマンス: グローバル p95 応答時間 < 200ms (読み取り API)、ポートフォリオ計算ジョブ SLA < 2 分。
- RPO: ≤ 15 分 (市場データ遅延)、RTO: ≤ 60 分 (主要リージョン障害時)。
- データ保持: 価格・構成銘柄履歴 7 年、監査ログ 5 年。
- セキュリティ: 全通信 TLS 1.3、FIPS 140-2 バックエンド暗号化、行レベルセキュリティ必須。
- スケーラビリティ: 1 日あたり 10 万 API リクエスト、1 万計算ジョブを水平スケールで吸収。

## 3. 全体アーキテクチャ
- マイクロサービス一覧
  - IndexConstituent Service: S&P500 構成銘柄と時価総額を取得し上位10銘柄を算出。
  - MarketData Service: 上位銘柄の価格・配当・ボラティリティ指標を収集し履歴を永続化。
  - PortfolioAnalytics Service: 最新データを基に効率的フロンティア・最適配分・リスク指標を算出。
  - UserPortfolio Service: ユーザー設定、保存ポートフォリオ、レポート生成を管理。
  - Notification & Webhook Service (将来拡張): SLA 超過や銘柄入替通知をエンタープライズ向けに配信。
- 通信パターン
  - 同期 REST API: API Gateway (Next.js Edge Routes) から各サービスの Cloudflare Workers API へリクエストを転送。
  - 非同期イベント: Cloudflare Queues と Supabase Realtime を組み合わせ、データ更新イベントや計算完了通知を分配。
  - 分散ジョブ: PortfolioAnalytics は CPU 負荷の高い処理を Cloudflare Workers と Durable Objects で分散し、長時間ジョブは Supabase Cron でスケジュール。
- データ分割
  - 各サービス専用に Neon 上の独立データベース (Database per Service) を割り当て、直接参照を禁止。
  - データ連携は REST API またはイベント経由とし、結果整合性はイベント駆動で確保。
- フロント / Gateway
  - Next.js (App Router, SSR) を OpenNext でビルドし Cloudflare Workers にデプロイ。API Routes は BFF 層として JWT 検証とキャッシュ制御を担当。
- CDN / キャッシュ
  - Cloudflare CDN + Cache Reserve、静的アセットは Cloudflare R2、画像は Cloudflare Images を使用。

## 4. 各マイクロサービスの概要
### IndexConstituent Service
- 責務: S&P500 構成銘柄・時価総額の取得、上位10銘柄のトラッキング、履歴保持。
- 代表API: GET /constituents/top10, GET /constituents/history, POST /constituents/sync (保護)。
- データ連携: 市場データ API ベンダー、PortfolioAnalytics へのイベント公開。

### MarketData Service
- 責務: 上位銘柄のOHLC、配当、ベータを取り込み、分単位キャッシュを提供。
- 代表API: GET /market-data/prices, POST /market-data/sync。
- データ連携: IndexConstituent からの構成更新イベントを購読、PortfolioAnalytics に時系列提供。

### PortfolioAnalytics Service
- 責務: 期待収益率・共分散行列の推定、効率的フロンティア、モンテカルロシナリオ、リバランス提案。
- 代表API: POST /analytics/frontier, POST /analytics/optimization, GET /analytics/jobs/{jobId}。
- データ連携: MarketData API と UserPortfolio 設定を統合し、計算完了時にイベント発行。

### UserPortfolio Service
- 責務: 組織・ユーザーのリスクプロファイル、ポートフォリオ保存、監査ログの提供。
- 代表API: GET /users/{id}/portfolios, POST /users/{id}/portfolios, GET /reports/compliance。
- データ連携: Supabase Auth JWT を検証し、PortfolioAnalytics 結果を取り込み保存。

### Notification & Webhook Service (拡張)
- 責務: 計算完了、指数入替、SLA 逸脱を外部システムへ通知。
- 代表API: POST /webhooks, POST /notifications/test。

## 5. 技術スタック
- フロントエンド: Next.js (SSR, App Router), TypeScript, React 18。
- デプロイ: OpenNext + Cloudflare Workers、wrangler で IaC 管理、minify 有効化。
- 認証と認可: Supabase Auth (JWT)、Row Level Security を全テーブルに適用。
- バックエンド: Cloudflare Workers (サービス毎に分離)、Durable Objects (長時間計算ロック管理)、Supabase Functions (補助バッチ)。
- データベース: Neon (PostgreSQL Serverless) 各サービス専用インスタンス、時系列拡張として TimescaleDB オプションを使用。
- ストレージ: Cloudflare R2 (履歴エクスポート、レポート PDF)、Cloudflare Images (チャート画像キャッシュ)。
- メッセージング: Cloudflare Queues + Supabase Realtime WebSocket。
- 決済: Stripe Billing (組織課金、アドオン計算クレジット)。
- 観測: OpenTelemetry (OTLP) + Honeycomb、Loki 互換ログ、Prometheus 互換メトリクス (Grafana Cloud)。
- IaC/CI: Terraform (Cloudflare/Neon/Supabase/Stripe), GitHub Actions (Lint/Test/Deploy)。

## 6. セキュリティ & コンプライアンス
- 認証フロー: Next.js BFF が Supabase Auth JWT を検証し、Cloudflare Workers で Audience・Issuer・Expiry を確認して RBAC クレームを RLS と連携。
- 認可: 各サービスはサービス固有スコープを利用、UserPortfolio は組織単位 ABAC。RLS は user_id = auth.uid() ルールを基本とし、管理者には org_id に基づくアクセス権を付与。
- データ保護: Neon で暗号化 at rest、Cloudflare R2 サーバーサイド暗号化、転送は TLS 1.3。PII は最小化し、顧客資産情報は保存しない。
- 入力検証: API Gateway 層で JSON Schema バリデーション、バックエンドで Prisma Zod スキーマ (Rust Worker は Valibot) を適用。
- 監査: Supabase Audit Log と Workers の構造化ログを 5 年保管し、アクセス履歴を UserPortfolio Service に連携。
- コンプライアンス: SOC 2 Type II を想定し、Cloudflare Logpush + 変更不可バケットでログ改ざんを防止。

## 7. 運用 & パフォーマンス
- 観測性: OpenTelemetry Trace Context を全リクエストで伝播し、Honeycomb でサービスグラフ、Grafana で SLO ダッシュボードを提供。
- CI/CD: GitHub Actions で Lint/Test/Deploy、Terraform Plan/Apply、自動デプロイは OpenNext Edge Deploy。Feature Flags は LaunchDarkly。
- デプロイ戦略: 各 Worker をバージョン管理し環境 (dev/stg/prod) ごとに分離。PortfolioAnalytics は Canary Release と負荷監視を組み合わせる。
- フェイルオーバー: Neon マルチリージョンフェイルオーバー、Supabase Storage バックアップ、Cloudflare Regional Failover Policies を活用。
- コスト最適化: Cloudflare 無料枠と R2 無料 egress、Neon 自動スケールダウン、計算はバッチ化して Stripe 使用量課金と連携。
- 運用手順: 週次で指数入替レポート、月次 SLO レビュー、重大インシデントは 30 分以内にステータスページを更新。
