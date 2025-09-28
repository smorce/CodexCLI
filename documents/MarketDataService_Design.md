# Market Data Service 詳細設計書

## 1. 概要・責務・境界
- Universe Ingestion Service で定義されたトップ 10 銘柄の価格・リターン・共分散統計を継続的に収集し、分析に必要なマーケットデータ API を提供する。
- リアルタイム性よりも正確性と整合性を優先し、15 分足データと日次統計を扱う。
- Universe Ingestion からのイベントで対象銘柄を更新し、Market Data 内でのみデータ加工を完結させる。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| GET | /market/prices | 指定銘柄の価格系列取得 | 必須 | symbol (必須), interval (任意: 15m,1d), start,end | JSON: priceSeries | 401, 403, 404, 422, 429, 500 |
| GET | /market/statistics/top10 | トップ 10 共分散・平均リターン取得 | 必須 | none | JSON: meanReturns, covarianceMatrix, asOf | 401, 403, 404, 429, 500 |
| POST | /market/recompute | 統計再計算ジョブ起動 | 必須 (Admin/PM) | JSON: windowDays, force | 202 + jobId | 401, 403, 409, 422, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: market_prices
- id (UUID, PK)
- symbol (text, indexed)
- bucket (timestamptz)
- interval (text) values: 15m, 1d
- open, high, low, close (numeric)
- volume (numeric)
- PRIMARY KEY (symbol, bucket, interval)

### テーブル: market_statistics
- id (UUID, PK)
- as_of (timestamptz unique)
- mean_returns (jsonb)
- covariance_matrix (jsonb)
- volatility (jsonb)
- created_at (timestamptz default now())
- checksum (text)

### Control テーブル: recompute_jobs
- id (UUID)
- status (enum: QUEUED, RUNNING, SUCCEEDED, FAILED)
- window_days (int)
- requested_by (uuid)
- started_at, finished_at (timestamptz)

RLS ポリシー
- market_prices: 読み取りは認証済みユーザーに限定。ワークスペース毎のアクセスは Universe に準拠。
- recompute_jobs: requested_by = auth.uid() か、ロールが Admin/PM の場合は全件参照。

## 4. 連携・依存関係
- Universe Ingestion Service の UniverseUpdated イベントを購読し、新規銘柄の価格収集を開始。
- 価格データ取得は Polygon.io などのマーケットデータ API (IEX 代替) を利用。冗長化のため FMP API をフォールバック設定。
- Portfolio Optimization Service へ market_statistics の最新スナップショットを配信。
- Notification Orchestrator に再計算完了イベントを送信。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT 必須。
- 認可: GET API は Viewer 以上、POST /market/recompute は Admin/Portfolio Manager のみ。
- レート制限: GET /market/prices 120 req/min/ユーザー、statistics 60 req/min/ワークスペース。
- 入力検証: symbol は A-Z 4〜6 文字、interval は許容値のみ、windowDays は 30〜365。
- データ暗号化: Neon 側で TDE、転送は TLS1.3。

## 6. エラーハンドリング方針
- 401/403: 認証・認可エラー。
- 404: symbol 不明または統計未生成。
- 409: 再計算ジョブの競合。
- 422: 入力バリデーション不備。
- 429: レート制限 or 外部 API クォータ超過。
- 500: 外部 API の障害、Circuit Breaker 発動時。
- エラー形式: { code, message, traceId }

## 7. 技術詳細
- ランタイム: TypeScript + Hono on Cloudflare Workers。
- データ収集ワーカー: Cloudflare Workers + Durable Object でジョブ管理、Wrangler Cron で 5 分毎実行。
- 計算: Python (PyPortfolioOpt) を WASM で呼び出し、共分散行列を生成。
- ストリーミング: Cloudflare Queues を介して PriceUpdate イベントをバッファし、Durable Object がバルク挿入。
- キャッシュ: 最新 statistics を Cloudflare KV/Cache に 5 分キャッシュ。
- 観測性: OpenTelemetry + Datadog、メトリクス (market_requests_total, recompute_duration_seconds)。
- テスト: Vitest (ユニット)、Pytest (数値検証)、Contract Test (Prism + statistics schema)、Integration (wrangler dev + Neon Branch)。
