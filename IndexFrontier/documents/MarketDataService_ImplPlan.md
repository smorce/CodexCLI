# MarketDataService Implementation Plan (TDD)

## スコープ
- OpenAPI 1.0.0 準拠の constituent / top-ten / price エンドポイント実装。
- Polygon/IEX Webhook取り込み、イベントアウトボックス連携、Cloudflare KVキャッシュ更新。
- Temporal ConstituentRefreshWorkflow トリガー。

## 前提条件
- 外部APIキーは Vault → Workers Secrets (`POLYGON_API_KEY`, `IEX_TOKEN`).
- `packages/common` に JWT検証ミドルウェア・エラーハンドラが存在。
- WASM計算層は不要（別サービス）。

## Tidy First
1. `packages/market-data` モジュールを追加し、HTTPサーバー雛形を整える。
2. Drizzle schema (`schema/marketdata.ts`) とマイグレーションディレクトリを作成。
3. 共通の入力検証ユーティリティ (`common/validation/symbol.ts`) を整備。

## TDD サイクル
1. **Red**: `GET /constituents` 正常系テスト（limit/offset）。
   - Green: Drizzle クエリ実装。
   - Refactor: ページングレスポンスユーティリティ抽出。
2. **Red**: `GET /constituents/top-ten` が KVキャッシュを読み出すテスト。
   - Green: KV fallback → DB sort 実装。
   - Refactor: キャッシュラッパを抽出。
3. **Red**: `POST /constituents/refresh` 認可テスト（role不一致で403）。
   - Green: ロール検証。
   - Refactor: Temporal クライアント呼び出しをポート化。
4. **Red**: refresh実行中は409となるテスト。
   - Green: Durable Object ロック実装。
5. **Red**: `GET /prices/snapshot` 正常/404ケース。
   - Green: `select latest` クエリ。
6. **Red**: `GET /prices/history` interval検証で422。
   - Green: クエリ構築。
7. **Red**: `POST /prices/ingest` 署名不一致で403。
   - Green: HMAC検証。
   - Refactor: 署名検証ユーティリティ共通化。
8. **Red**: `prices.snapshot` イベントが outbox に記録されるテスト。
   - Green: トランザクション実装。
9. **Red**: 401テスト（未認証アクセス）を全エンドポイントに適用。

## 非機能テスト
- Contract tests (Prism) で OpenAPI 準拠確認。
- データ鮮度: テストで `FreshnessTracker` Durable Object が更新されることを検証。
- レート制限: middlewareユニットテストで 300 req/min 超過時429。

## 観測性
- OpenTelemetry exporter モックで span 属性 `symbol`, `as_of` を検証。
- Auditログエントリが refresh / ingest で生成されるかテスト。

## 完了条件
- `uv run --link-mode=copy pnpm test --filter market-data` が Green。
- Drizzle マイグレーションに RLS, インデックスが含まれる。
- Cloudflare KV と Durable Object binding が wrangler 設定に定義。
- OpenAPI diff なし、Contractテストパス。
