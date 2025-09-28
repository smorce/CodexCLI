# Universe Ingestion Service 詳細設計書

## 1. 概要・責務・境界
- S&P 500 構成銘柄の時価総額ランキングを取得し、トップ 10 銘柄と関連メタデータを最新化するバッチ兼 API サービス。
- データの正確性 (データプロバイダの冪等性検証) と更新スケジュール管理を担い、UniverseUpdated イベントを発行する。
- 他サービスからの書き込みを受け付けず、Universe に関する読み取り・同期要求のみを扱う。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| GET | /universe/top10 | 最新トップ 10 銘柄リスト取得 | 必須 | クエリ: asOf (任意, RFC3339) | JSON: symbols 配列、更新日時 | 401, 403, 404, 429, 500 |
| POST | /universe/sync | 強制同期ジョブのトリガー | 必須 (Admin 権限) | JSON: { "sourceOverride": string? } | 202 + syncJobId | 401, 403, 409, 422, 429, 500 |
| GET | /universe/sync/{syncJobId} | 同期ジョブ状態確認 | 必須 | パス: syncJobId (UUID) | JSON: { status, startedAt, finishedAt, error? } | 401, 403, 404, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: universe_snapshots
- id (UUID, PK)
- as_of (timestamptz, unique)
- top_symbols (text[10])
- source (text)
- created_at (timestamptz default now())
- checksum (text)
- metadata (jsonb)
- constraints:
  - unique (as_of)
  - check (array_length(top_symbols, 1) = 10)

### テーブル: universe_events
- id (UUID, PK)
- snapshot_id (UUID FK → universe_snapshots.id)
- event_type (text, values: SYNC_SUCCESS, SYNC_FAILURE)
- payload (jsonb)
- occurred_at (timestamptz default now())
- trace_id (text)

Row Level Security
- ポリシー: auth.uid() = metadata->>'requested_by'
- 読み取り: 認証済み全員 (Workspace 内) が最新の snapshot を参照可能。

## 4. 連携・依存関係
- IEX Cloud (REST) から S&P 500 全銘柄リストと Market Cap を取得 (API Key は Secrets Manager)。
- Market Data Service へ UniverseUpdated イベント (Cloudflare Queues) を送信。
- Notification Orchestrator に再計算通知を送る。
- Supabase Auth の JWT を検証し、ワークスペース権限を Hono Middleware で確認。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT 必須。Edge Middleware で検証後、サービス内でクレーム (workspace_id, role) を検証。
- 認可: POST /universe/sync は role が Admin または Portfolio Manager のみ許可。
- レート制限: GET /universe/top10 → 60 req/min/ユーザー、POST /universe/sync → 10 req/hour/ワークスペース。
- 入力検証: schema バリデーション (as_of は RFC3339、sourceOverride は 32 文字以内)。

## 6. エラーハンドリング方針
- 401: JWT Missing/Expired。
- 403: RBAC 違反。
- 404: 指定 syncJobId が存在しない、または非公開。
- 409: 同期ジョブが既に実行中。
- 422: 入力バリデーション失敗。
- 429: レート制限。
- 500: 外部 API 障害。Circuit Breaker でフォールバックし、最後の成功 snapshot を返却。
- エラー形式: { "code": string, "message": string, "traceId": string }

## 7. 技術詳細
- ランタイム: TypeScript + Hono on Cloudflare Workers。Durable Object で同期ジョブ状態管理。
- スケジューラ: Cloudflare Cron Triggers (日次 21:00 UTC)。
- データアクセス: Prisma Data Proxy。トランザクションは snapshot 作成時にシリアライズ。
- 分散トレーシング: OpenTelemetry (traceparent をヘッダから抽出)。
- キャッシュ: Cloudflare KV で最新 snapshot を 1 分キャッシュ。
- テスト: Vitest (ユニット)、Prism (OpenAPI 契約)、MSW (外部 API モック)、Integration (Workers + Neon Branch)。
