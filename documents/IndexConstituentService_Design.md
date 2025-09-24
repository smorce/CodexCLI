# IndexConstituentService Detailed Design

## 1. 概要 / 責務 / 境界
- S&P 500 の構成銘柄を外部マーケットデータプロバイダ (Polygon.io を想定) から取得し、時価総額上位 10 銘柄 (Top10) を判定・履歴管理する。
- Top10 の入れ替え・順位変動を検知し、下流サービス (MarketDataService, PortfolioManagementService) にイベント通知する。
- ポートフォリオ計算に必要なメタデータ (ティッカー、セクター、時価総額、ESG スコアなど) を提供する。
- 外部 API の異常・レート制限を可視化し、再試行ポリシーを管理する。

境界:
- 市場データ (価格系列) の保管・集計は MarketDataService が担い、本サービスは実施しない。
- 最適化ジョブの開始・結果管理は OptimizationService に委譲。

## 2. API 一覧
| メソッド | パス | 説明 |
|---|---|---|
| GET | /v1/constituents/top10 | 指定日時時点の Top10 銘柄リストを取得 |
| GET | /v1/constituents/history | Top10 ランキング履歴をページングで取得 |
| GET | /v1/constituents/changes | 入れ替え・順位変動イベントを返却 |
| POST | /v1/constituents/sync | 即時同期ジョブを起動 (管理者限定) |
| GET | /v1/constituents/providers/status | 外部プロバイダの接続状態を返却 |

### 2.1 エンドポイント詳細
1. GET /v1/constituents/top10
    - クエリ: sOf (optional, RFC3339), orgId (optional, Supabase JWT claims から取得)。
    - レスポンス: [{ symbol, name, sector, rank, marketCapUsd, weightEstimate, effectiveAt }]。
    - キャッシュ: Cloudflare KV 60 秒。
2. GET /v1/constituents/history
    - クエリ: start, end, cursor, limit (<=100)。
    - レスポンス: ページングされた Top10Snapshot レコードと 
extCursor。
3. GET /v1/constituents/changes
    - クエリ: since (必須), 	ype (ADDITION|REMOVAL|RERANK)。
    - レスポンス: ChangeEvent 配列。Queue で発行される payload と同一。
4. POST /v1/constituents/sync
    - ボディ: { "forced": boolean, "providerOverride": string? }。
    - 認可: ole=admin のみ。ジョブを Durable Object に enque。
    - レスポンス: { jobId, status }。
5. GET /v1/constituents/providers/status
    - レスポンス: 外部 API ごとの稼働状況、残りクォータ、最後の成功時刻。

### 2.2 入出力スキーマ (抜粋)
- Top10Record
`json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "sector": "Information Technology",
  "rank": 1,
  "marketCapUsd": "3123456789123",
  "weightEstimate": 0.18,
  "effectiveAt": "2025-09-23T00:00:00Z"
}
`
- ChangeEvent
`json
{
  "eventId": "uuid",
  "type": "ADDITION",
  "symbol": "NFLX",
  "previousSymbol": "META",
  "effectiveAt": "2025-09-23T14:35:00Z",
  "orgId": "uuid",
  "source": "POLYGON",
  "metadata": {
    "rank": 9,
    "previousRank": 11
  }
}
`
- エラー形式: 全エンドポイント共通で { "code": "string", "message": "string", "details": object? }。

## 3. データモデル & スキーマ
Neon (PostgreSQL) index_constituent schema。
- constituent_snapshots
    - snapshot_id UUID PK
    - org_id UUID (RLS でフィルタ)
    - effective_at TIMESTAMP WITH TIME ZONE
    - symbol, 
ame, sector, ank, market_cap_usd NUMERIC(20,2), esg_score NUMERIC(5,2)
    - weight_estimate NUMERIC(6,4)
    - created_at TIMESTAMP DEFAULT now()
    - CHECK: ank BETWEEN 1 AND 10, market_cap_usd > 0
- constituent_changes
    - event_id UUID PK
    - org_id
    - 	ype TEXT CHECK (	ype IN ('ADDITION','REMOVAL','RERANK'))
    - symbol, previous_symbol, previous_rank, 
ew_rank
    - effective_at
    - payload JSONB
    - INDEX: idx_changes_effective_at, idx_changes_symbol
- provider_status
    - provider TEXT PK
    - status TEXT, last_success_at, quota_remaining, error_count

Row Level Security:
- CREATE POLICY select_owned ON constituent_snapshots USING (org_id = auth.uid()) (Supabase auth)。
- 管理者 (ole クレーム) のみ書き込み可 (INSERT/UPDATE)。

Durable Object: SyncCoordinator にて同期ジョブログを管理、PostgreSQL の sync_jobs テーブルで永続化。

## 4. 連携 / 依存関係
- 外部: Polygon.io (HTTP REST, API key)・バックアッププロバイダ Alpha Vantage。レート制限情報は provider_status に格納。
- 内部: Cloudflare Queues index.constituent.change に ChangeEvent を発行。MarketDataService/PortfolioManagementService が購読。
- 認証: Supabase Auth JWT を Workers Middleware で検証。
- 設定: Cloudflare Workers KV にプロバイダ API Keys (Encrypted) を保持。Terraform でデプロイ。

## 5. セキュリティ / 認可 / レート制限 / 入力検証
- すべてのエンドポイントに Bearer JWT 必須。POST /sync は ole=admin + IP 許可リスト。
- Rate Limit: /top10, /history, /changes は 600 rpm / org。/sync は 10 req/日。
- 入力検証: JSON Schema -> orced は boolean, providerOverride は POLYGON|ALPHAVANTAGE の Enum。
- レスポンス整形: PII は扱わない。メタデータのみ。

## 6. エラーハンドリング方針
- 401: JWT 不正/期限切れ。
- 403: 権限不足 (POST /sync)。
- 404: 指定日時にデータなし (sOf が過去で記録なし)。
- 409: 同期ジョブが既に進行中。
- 422: クエリパラメータ不正、Enum 不一致。
- 429: 組織のレート制限超過、外部 API レート制限。Retry-After ヘッダーを付与。
- 500: 外部 API 障害を隠蔽せず code=UPSTREAM_ERROR。

## 7. 技術詳細
- Stack: Cloudflare Workers (TypeScript) + Hono Router + Prisma Data Proxy。
- ジョブスケジュール: Workers Cron (5 分間隔) で POST /sync と同機能の内部処理を実行。
- 冪等性: sync_jobs にユニークキー (provider, window_start) を設定。外部呼び出し前にロック。
- テレメトリ: OpenTelemetry Span を API ごとに発行、Queue 送信イベントを記録。Polygon.io へのリクエスト時間をメトリクス化。
- テスト: WireMock による外部 API モック、RLS テスト (Supabase emulator)、Queue 発行検証。
