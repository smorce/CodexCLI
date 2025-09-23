# PortfolioManagementService Detailed Design

## 1. 概要 / 責務 / 境界
- 組織・ユーザー単位のポートフォリオ定義と承認ワークフローを管理。
- OptimizationService からの最適化結果を取り込み、承認済みポートフォリオとして保存。
- 監査ログとレポート (PDF/CSV) を生成し、R2 に保存。

境界:
- 数値計算は行わない (OptimizationService に依存)。
- 認証は Supabase Auth を利用し、ID プロバイダ連携はこのサービスの責務外。

## 2. API 一覧
| メソッド | パス | 目的 |
|---|---|---|
| POST | /v1/portfolios | 新規ポートフォリオ下書き作成 |
| GET | /v1/portfolios | ポートフォリオ一覧取得 (フィルタ/ページング) |
| GET | /v1/portfolios/{portfolioId} | ポートフォリオ詳細取得 |
| PATCH | /v1/portfolios/{portfolioId} | 下書きの更新 |
| POST | /v1/portfolios/{portfolioId}/approve | 承認ワークフロー進行 |
| POST | /v1/portfolios/{portfolioId}/publish-report | レポート生成要求 |
| GET | /v1/reports/{reportId} | 生成済みレポートのダウンロード署名付き URL |

### 2.1 エンドポイント詳細
1. POST /portfolios
    - リクエスト: { name, description, objective, baseCurrency, targetReturn, createdFromJobId }
    - レスポンス: { portfolioId, status: "DRAFT" }
    - createdFromJobId が指定された場合、OptimizationService の結果を取り込み。
2. GET /portfolios
    - クエリ: status, rom, 	o, cursor, limit (<=50)。
    - レスポンス: リスト + 
extCursor。
3. GET /portfolios/{id}
    - レスポンス: メタデータ、最新承認状態、構成銘柄・ウェイト、関連レポート。
4. PATCH /portfolios/{id}
    - リクエスト: 下書き属性の更新 (name/description/objective/constraints)。
    - レスポンス: 更新後ポートフォリオ。
5. POST /portfolios/{id}/approve
    - リクエスト: { action: "SUBMIT"|"APPROVE"|"REJECT", comment }
    - 状態遷移: DRAFT -> PENDING_REVIEW -> APPROVED/REJECTED。
6. POST /portfolios/{id}/publish-report
    - ジョブ生成: Durable Object ReportGenerator が OptimizationService の結果と MarketDataService の実測をまとめ PDF/CSV 生成。
7. GET /reports/{reportId}
    - レスポンス: { url, expiresAt } (Cloudflare R2 signed URL)。

共通エラー: ErrorResponse。

## 3. データモデル & スキーマ
Neon portfolio schema。
- portfolios
    - portfolio_id UUID PK
    - org_id, owner_user_id
    - 
ame, description
    - status (DRAFT|PENDING_REVIEW|APPROVED|REJECTED)
    - objective (MAX_RETURN|MIN_RISK|MAX_SHARPE)
    - ase_currency TEXT (ISO 4217)
    - 	arget_return NUMERIC(8,6)
    - created_from_job_id UUID (FK -> optimization_jobs)
    - created_at, updated_at
- portfolio_allocations
    - llocation_id UUID PK
    - portfolio_id UUID FK
    - symbol, weight NUMERIC(6,4)
    - expected_return, olatility NUMERIC(8,6)
- pproval_logs
    - pproval_id UUID PK
    - portfolio_id
    - ctor_user_id
    - ction (SUBMIT|APPROVE|REJECT)
    - comment TEXT
    - performed_at TIMESTAMP WITH TIME ZONE
- eports
    - eport_id UUID PK
    - portfolio_id
    - eport_type (PDF|CSV)
    - storage_uri TEXT (R2)
    - status (QUEUED|GENERATING|READY|FAILED)
    - generated_at

RLS: org_id = auth.uid() (組織単位)。更に status != APPROVED のポートフォリオは owner_user_id または ole=reviewer 以上のみ閲覧可。

## 4. 連携 / 依存関係
- Supabase Auth: ユーザー属性 (org_id, roles)。
- OptimizationService: GET /jobs/{id} で結果を取得。
- MarketDataService: レポート生成時に最新統計を取得。
- Cloudflare R2 + Images: レポート格納。
- Cloudflare Pub/Sub: Next.js クライアントへ承認ステータス通知。

## 5. セキュリティ / 認可 / レート制限 / 入力検証
- POST /portfolios は ole=analyst 以上。pprove は ole=reviewer 以上。
- Rate Limit: /portfolios 600 rpm, /publish-report 30 rpm。
- 入力検証: 	arget_return 0〜0.5、weights 合計 1.0 ± 0.001、comment 最大 2000 文字。

## 6. エラーハンドリング
- 401/403/404/409/422/429/500。
- 409: 状態遷移違反 (例: APPROVED のポートフォリオを編集)。
- 422: weights 合計不一致、	arget_return 範囲外。
- 500: レポート生成失敗 (外部テンプレートエンジンエラー)。

## 7. 技術詳細
- REST: Cloudflare Workers + Hono。
- レポート生成: Durable Object + R2 (Rust/Wasm を使用し pdf-lib / csv writer)。
- 通知: Cloudflare Pub/Sub (channel portfolio-status)。
- テスト: Jest + Supabase emulator + Queue/PubSub モック。
- DevOps: Prisma migration, Data seeding (初回 DRAFT テンプレート) は別 Issue。
