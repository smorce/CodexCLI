# MarketDataService Design

## 概要 / 責務 / 境界
- **責務**: S&P500構成銘柄の取得、トップ10（フリーフロート時価総額上位）の決定、リアルタイム価格・リターン系列の正規化、指数・データ品質指標の配信。
- **境界**: マスターデータ（銘柄、指数）、OHLCVスナップショットを管理。ポートフォリオ計算はPortfolioOptimizationServiceに委譲。
- **利用者**: PortfolioOptimizationService、PortfolioInsightsService、外部クライアントAPI。

## API 一覧
| Method | Path | 目的 |
| --- | --- | --- |
| GET | /constituents | 最新のS&P500構成銘柄リスト取得 |
| GET | /constituents/top-ten | トップ10銘柄（フリーフロート時価総額順）取得 |
| POST | /constituents/refresh | S&P500構成リストの強制更新（管理者） |
| GET | /prices/snapshot | 指定銘柄の最新価格スナップショット |
| GET | /prices/history | 指定銘柄の履歴OHLCVを返却 |
| POST | /prices/ingest | 外部データソースからの価格レコード登録（Webhooks） |

### エンドポイント詳細
#### GET /constituents
- **クエリ**: `asOf` (date optional), `limit`, `offset`, `includeMeta`。
- **レスポンス**: Constituents配列、指数メタデータ。

#### GET /constituents/top-ten
- **説明**: 最新リフレッシュ時点のトップ10銘柄（symbol, weight, marketCapFreeFloat）。
- **キャッシュ**: Cloudflare KV 1分TTL。

#### POST /constituents/refresh
- **権限**: `data_admin` ロールのみ。
- **処理**: Polygon.io Fundamentals API から全構成銘柄取得し、NeonにUPSERT。差分を検出しイベント`constituents.updated`を発行。

#### GET /prices/snapshot
- **クエリ**: `symbol` (必須, max 10), `asOf` (timestamp optional)。
- **レスポンス**: `bid`, `ask`, `last`, `volume`, `marketCap` 等。

#### GET /prices/history
- **クエリ**: `symbol`, `start`, `end`, `interval`(1m/5m/1d)。
- **レスポンス**: 時系列配列。

#### POST /prices/ingest
- **用途**: 価格プロバイダのWebhook（Polygon/IEX）を受信。
- **認証**: HMAC-SHA256署名検証。
- **処理**: 生データ検証後、Neonへ保存し`prices.snapshot`イベントをキューへ送出。

## データモデル & スキーマ
- **constituents**
  - `constituent_id` UUID PK
  - `tenant_id` UUID
  - `symbol` text
  - `cusip` text
  - `company_name` text
  - `sector` text
  - `free_float_market_cap` numeric(18,2)
  - `weight` numeric(10,6)
  - `as_of` date
  - `source` text
  - `is_active` bool
  - `created_at`, `updated_at`
- **prices_intraday**
  - `price_id` UUID PK
  - `tenant_id` UUID
  - `symbol` text
  - `as_of` timestamptz
  - `open`, `high`, `low`, `close` numeric(18,4)
  - `volume` bigint
  - `market_cap` numeric(18,2)
  - `source` text
  - UNIQUE(`tenant_id`,`symbol`,`as_of`,`source`)
- **top_ten_cache**
  - `tenant_id` UUID
  - `as_of` timestamptz
  - `symbols` text[]
  - `weights` numeric[]
- **ingest_audit**
  - `audit_id` UUID PK
  - `payload_hash` text
  - `received_at` timestamptz
  - `status` text enum(`accepted`,`rejected`)
  - `reason` text

### RLSポリシー
- すべて `tenant_id = current_setting('app.tenant_id')`。
- `data_admin` は refresh 操作、`quant_user` は読み取りのみ。
- Webhookは共有シークレットに紐づく特別APIキー利用でRLSバイパスせず、`system_tenant` contextで動作。

## 連携 / 依存関係
- Polygon.io & IEX Cloud: REST/WebSocket API を cron Worker で呼出。
- Temporal Workflow `ConstituentRefreshWorkflow` が日次/イベントトリガーで実行。
- Cloudflare Queues: `constituents.updated`, `prices.snapshot` イベントを PortfolioOptimizationService へ配信。
- Cloudflare KV: トップ10キャッシュ、データ品質指標のステータス。
- ClickHouse: 日足データをParquet経由で取り込み。

## セキュリティ / 認可 / レート制限 / 入力検証
- JWT必須 (除く Webhook)。`X-Tenant-Id` header と一致検証。
- レート制限: GET 300 req/min/tenant、POST refresh 10 req/day。
- Webhook署名: `X-Signature` ヘッダHMAC検証。タイムスタンプ差2分以内で受諾。
- Zodスキーマで入力検証。`symbol`は[A-Z]{1,5}。
- KVキャッシュ書き込み時は `symbol` 存在確認。

## エラーハンドリング
- 401/403: 認証・権限エラー。
- 404: シンボル未登録。
- 409: Refresh競合（既実行中）。
- 422: 無効データ。
- 429: レート制限。
- 502: 外部API失敗時（リトライポリシー明記）。

## 技術詳細
- Hono + Cloudflare Workers。`uv`でPyodideビルド不要。
- Drizzle ORM for Neon。マイグレーション `migrations/marketdata`。
- Outboxテーブル `marketdata_outbox` + バッチWorker。
- OpenTelemetry span attributes: `symbol`, `as_of`, `provider`。
- Data freshnessメトリクス: Durable Object `FreshnessTracker`に書込み。
