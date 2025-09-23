# MarketDataService Detailed Design

## 1. 概要 / 責務 / 境界
- TopTenFrontier の対象銘柄 (常に最新の Top10) の価格・リターン時系列を管理し、統計量 (平均リターン、分散、共分散、シャープレシオ要素) を提供する。
- IndexConstituentService からの変更イベントを受けて、対象銘柄のデータインポートタスクを起動する。
- OptimizationService へ効率的フロンティア計算用の集約データを REST/API Cache で提供する。

境界:
- 市場データ以外のファンダメンタル指標・ニュース等は扱わない。
- 最適化アルゴリズムは OptimizationService の責務。

## 2. API 一覧
| メソッド | パス | 目的 |
|---|---|---|
| GET | /v1/market-data/returns | 銘柄ごとのリターン系列を取得 |
| GET | /v1/market-data/covariance | 指定ウィンドウの共分散行列を取得 |
| GET | /v1/market-data/statistics | 期待リターン・ボラティリティ等の統計量を取得 |
| POST | /v1/market-data/ingest | 指定銘柄のデータインポートを起動 (管理者) |
| GET | /v1/market-data/health | バックフィルジョブ・外部 API の状態確認 |

### 2.1 エンドポイント詳細
1. GET /returns
    - クエリ: symbols (CSV)、requency (daily|intraday)、start, end。
    - レスポンス: eturns 配列 (timestamp, symbol, returnPct)。intraday は 5 分足。
2. GET /covariance
    - クエリ: windowDays (22, 63, 126, 252)、sOf。
    - レスポンス: matrix: [{ symbol, covariances: { otherSymbol: value } }]。
3. GET /statistics
    - クエリ: sOf, requency。
    - レスポンス: statistics: [{ symbol, expectedReturn, volatility, beta, sharpe }].
4. POST /ingest
    - ボディ: { "symbols": ["AAPL"], "range": { "start": "2025-01-01", "end": "2025-09-23" } }。
    - 処理: Durable Object ジョブ + Cloudflare Queue marketdata.ingest。
5. GET /health
    - レスポンス: ジョブキュー深度、外部 API 成功率、最後の成功時刻。

エラー形式: 共通 ErrorResponse。

## 3. データモデル & スキーマ
Neon market_data schema。
- price_bars
    - ar_id UUID PK
    - symbol TEXT
    - requency TEXT (DAILY, INTRADAY_5M)
    - ar_time TIMESTAMP WITH TIME ZONE
    - open, high, low, close NUMERIC(18,6)
    - olume BIGINT
    - UNIQUE (symbol, requency, ar_time)
- log_returns
    - eturn_id UUID PK
    - symbol
    - requency
    - s_of DATE (daily) or TIMESTAMP (intraday)
    - eturn_pct NUMERIC(12,8)
- covariance_matrices
    - matrix_id UUID PK
    - s_of DATE
    - window_days INTEGER CHECK (window_days IN (22,63,126,252))
    - matrix JSONB (row-wise storage)
    - UNIQUE (s_of, window_days)
- statistics
    - stat_id UUID PK
    - symbol
    - s_of DATE
    - requency TEXT
    - expected_return, olatility, eta, sharpe NUMERIC(10,6)

RLS:
- org_id 列を全テーブルに追加。USING (org_id = auth.uid())。
- 読み取りは全ユーザー可 (同組織)。書き込みは ole=admin。

メタデータ:
- Cloudflare KV marketdata:last_ingest:{symbol} に直近同期時刻。

## 4. 連携 / 依存関係
- IndexConstituentService change events。新規シンボル追加で POST /ingest を起動。
- 外部 API: Polygon.io 2/aggs/ticker/{symbol}/range。
- OptimizationService: REST クライアント (Hono) + Cloudflare Cache を通して GET /covariance, GET /statistics を利用。

## 5. セキュリティ / 認可 / レート制限 / 入力検証
- JWT 必須。POST /ingest は ole=admin。
- Rate Limit: /returns 900 rpm、/covariance 300 rpm、/statistics 600 rpm。
- 入力検証: symbols 最大 10 銘柄、requency Enum、start<=end。
- データ整合性: 重複バー挿入時は UPSERT。

## 6. エラーハンドリング
- 401/403/422/429/500 を標準化。
- 503 を使用せず、外部 API ダウンは code=UPSTREAM_UNAVAILABLE で 500。
- POST /ingest で進行中ジョブは 409。

## 7. 技術詳細
- データ処理: Durable Object IngestCoordinator がジョブキューを管理し、Workers Unbound で大量データを取得。
- 計算: Rust + Wasm モジュールで共分散/統計を再計算。計算結果は Neon へ保存。
- キャッシュ: Cloudflare Cache API (エッジキャッシュ 60 秒) を /statistics に適用。
- 観測性: k6 で /returns テスト (p95<200ms)、OpenTelemetry で ingest 時間を計測。
- テスト: Prisma + Supabase emulator、WireMock for Polygon、Golden data set (CSV) のスナップショットテスト。
