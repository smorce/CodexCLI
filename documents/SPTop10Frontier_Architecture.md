# SPTop10Frontier アーキテクチャ仕様書

## 1. Executive Summary & Business Goals
- S&P 500 の時価総額上位 10 銘柄を常時トラッキングし、最新の構成銘柄から効率的フロンティアを算出するセルフサービス型の投資分析プラットフォームを提供する。
- エンタープライズ利用に耐える監査性・可用性・セキュリティ・ガバナンスの基準を満たし、投資アナリストがチームで共同作業できる環境を実現する。
- データ提供者変更や銘柄入れ替えに対して 1 営業日以内 (8 時間未満) の追従を保証し、最新のマーケットデータに基づいたポートフォリオ最適化を可能にする。
- 投資判断のプロセスを記録し、各ポートフォリオ案のリスク・リターン指標を即時に可視化することで、意思決定サイクルを従来比 50% 短縮する。

## 2. Non-Functional Requirements
- パフォーマンス: 投資指標計算 API の p95 応答時間 < 200ms、バッチ再計算ジョブ完了 SLA < 5 分。
- 可用性: 月間 99.95% 以上、地域冗長構成 (Cloudflare + Neon マルチ AZ)。
- 耐障害性: MTTR ≤ 15 分、プラットフォーム全体のフォールトドメインを分離。
- データ保護: RPO ≤ 15 分、RTO ≤ 60 分。監査ログは 5 年間保管。
- セキュリティ: 全通信 TLS 1.3、Supabase Auth による JWT ベースのアクセス制御、全テーブルに RLS を適用。
- コンプライアンス: SOC 2 Type II 水準の統制、監査証跡完全性。変更管理は GitOps でトレース可能。
- 可観測性: 100% のリクエストで分散トレーシング (W3C Trace Context) と構造化ログを出力。主要メトリクス (リクエスト数、エラー率、レイテンシ、ジョブ成功率) を 1 分粒度で収集。

## 3. 全体アーキテクチャ
- アーキテクチャスタイル: マイクロサービス + サーバーレスエッジコンピューティング。
- 同期通信: API Gateway (Cloudflare Workers + OpenNext) を介した REST/GraphQL。
- 非同期通信: Cloudflare Queues / PubSub を利用したイベント駆動 (銘柄入替通知、再計算トリガー)。
- サービスメッシュ: Cloudflare Service Bindings と OpenTelemetry 連携により、ゼロトラスト境界・トレーシングを一元化。
- データ分割: サービス毎に Neon (PostgreSQL) インスタンスを論理分割 (マネージドルールによるスキーマ分離)。
- API 経路: 外部クライアントは Cloudflare CDN + API Gateway を経由し、内部マイクロサービスは Supabase Auth の JWT を検証した上で相互通信。
- キャッシュ: Cloudflare KV による短期キャッシュ、長期は R2 + Edge Cache。
- 外部依存: S&P 500 構成情報は IEX Cloud などのデータプロバイダ API を利用。為替レートなどはオプション。

## 4. 各マイクロサービスの概要
1. Universe Ingestion Service
   - 役割: S&P 500 枠内の時価総額順位を日次で取得し、トップ 10 銘柄リストとメタデータを保持。
   - 代表 API:
     - GET /universe/top10: 最新のトップ 10 銘柄リスト取得
     - POST /universe/sync: データプロバイダからの手動同期要求
   - データ: 参照テーブル (symbols, market_cap, sector, updated_at)。UniverseUpdated イベントを発行。

2. Market Data Service
   - 役割: トップ 10 銘柄の時間足価格データを収集し、必要な統計量 (リターン、共分散) を算出。
   - API:
     - GET /market/prices?symbol=...
     - GET /market/statistics/top10
   - データ: 時系列価格、ボラティリティ、相関行列。UniverseUpdated イベントを購読して対象銘柄を更新。

3. Portfolio Optimization Service
   - 役割: 効率的フロンティア、シャープレシオ、制約付き最適化の計算。
   - API:
     - POST /portfolio/efficient-frontier
     - POST /portfolio/optimal-weights
   - データ: 入力リクエストを Supabase RLS でユーザー別に保護。結果セットはキャッシュ。

4. Portfolio Insights Service
   - 役割: 計算結果の可視化用指標生成、レポート、ドキュメント化。
   - API:
     - GET /insights/summary/{portfolioId}
     - POST /insights/report
   - 非同期: PortfolioComputed イベントを受けて Markdown/PDF レポートを生成し Cloudflare R2 に格納。

5. User Collaboration Service
   - 役割: チーム管理、コメント、ワークスペース設定。
   - API:
     - POST /workspaces
     - POST /workspaces/{id}/comments
   - データ: Supabase Auth 連携でワークスペースごとの RBAC を実施。監査ログを 5 年保存。

6. Notification Orchestrator
   - 役割: Universe 更新・再計算完了の通知 (Email/Webhook)。
   - API: POST /notifications/dispatch
   - イベント駆動: Queue を介して遅延再試行、指数バックオフ。

7. Frontend (Next.js)
   - 役割: 投資家 UI、ダッシュボード、レポート閲覧、可視化。
   - デプロイ: OpenNext + Cloudflare Workers、画像は Cloudflare Images。

注記: 決済機能はスコープ外であり、実装対象に含めない。

## 5. 技術スタック
- フロントエンド: Next.js (App Router, SSR)。ビルド: OpenNext。デプロイ: Cloudflare Workers + Pages。UI: React 18, TailwindCSS。
- API Gateway: Cloudflare Workers (TypeScript)、wrangler.jsonc で minify true、Durable Objects をルーティング調停に活用。
- バックエンドサービス: TypeScript (Node.js 20) + Hono フレームワーク。Prisma (Data Proxy) 経由で Neon へ接続。
- データベース: Neon サーバーレス PostgreSQL (各サービス専用スキーマ)。RLS + CHECK 制約、pgvector 拡張を利用。
- 認証・認可: Supabase Auth (JWT)、Edge Middleware で検証。ワークスペース RBAC は Supabase Policy で実装。
- オブジェクトストレージ: Cloudflare R2。レポートと添付資料を暗号化 (AES-256) して保存。
- 画像/メディア: Cloudflare Images。UI 内のチャートサムネイル最適化。
- イベント基盤: Cloudflare Queues + Durable Objects、分散トレーシングは OpenTelemetry Collector を Workers に組み込み。
- 分析ライブラリ: Python (uv + PyPortfolioOpt) を Optimization Service の計算ワーカーとして Cloudflare Workers の WASM 実行環境にデプロイ。
- CI/CD: GitHub Actions → Wrangler Deploy → Neon Branch Promotion。Schema migration は Prisma Migrate を GitOps 化。

## 6. セキュリティ & コンプライアンス
- 認証: Supabase Auth。多要素認証必須、組織 SSO (SAML/OIDC) をサポート。JWT 有効期間は 15 分、Refresh Token は 7 日。
- 認可: ワークスペース単位の RBAC、ロール: Admin, Portfolio Manager, Analyst, Viewer。RLS で user_id = auth.uid() を基本条件に設定。
- データ保護: すべての保存データは暗号化 (Neon: TDE、R2: SSE-KMS)。PII は User Collaboration Service に限定。
- ネットワーク: Cloudflare Zero Trust、WAF、Bot Management。すべてのマイクロサービス通信に mTLS。
- 監査: アクセスログ・操作ログを Cloudflare Logpush で Datadog に集約。ログハッシュを Vault に蓄積し改ざん検出。
- 入力検証: API Gateway で JSON Schema 検証を実施。Rate Limit (100 req/min per user) を適用。
- コンプライアンス: SOC 2 Type II、SEC 規制対応として変更履歴・監査ログを 5 年保存。データ居住地は米国東部リージョン。

## 7. 運用 & パフォーマンス
- 可観測性: OpenTelemetry + Datadog。トレースサンプリング率 50%、SLO 逸脱時に PagerDuty 通知。
- デプロイ戦略: GitOps (GitHub Actions → Wrangler → Cloudflare)。Blue/Green (Workers)、Neon Branch の段階的プロモーション。Schema migration は Feature Branch → Staging → Prod。
- テスト戦略: TDD 準拠。ユニット (Vitest)、契約テスト (Prism + Dredd)、E2E (Playwright with Workers)。
- レジリエンス: Universe/Market Data Service はリトライ (指数バックオフ最大 3 回)、Circuit Breaker (Resilience4j 相当) を実装。フォールバックとして直近計算結果のキャッシュ配信。
- コスト最適化: Workers/Queues/Images/R2 の無料枠を活用。Neon は Auto Scaling (1-4 vCPU)。データ取得 API の使用量監視。
- リリース管理: 変更は RFC → Architecture Decision Record → Pull Request の順で承認。Feature Flag (Unleash) で段階的リリース。
- サポート: 24/5 オンコール、重大インシデントは 30 分以内に初動。Runbook とプレイブックを Notion + GitOps で管理。
