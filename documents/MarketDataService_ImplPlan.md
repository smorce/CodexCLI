# Market Data Service 実装計画

## 1. 目的
- トップ 10 銘柄の価格データと統計量 API を TDD ベースで実装し、Portfolio Optimization への正確な入力を提供する。

## 2. 前提条件
- Universe Ingestion Service が UniverseUpdated イベントを発行済みであることを前提とする。
- documents/MarketDataService_Design.md / MarketDataService_OpenAPI.yaml を正とする。
- 外部マーケットデータ API (Polygon.io) の資格情報が環境変数 POLYGON_API_KEY に格納されている。

## 3. 実装ポリシー
- TDD: 各エンドポイント・ジョブ毎に Red → Green → Refactor。
- Tidy First: 既存コード整理・共通化は専用コミットに分離。
- 数値安定性: 浮動小数点演算は Python (PyPortfolioOpt) モジュールを WASM で呼び出し、検証用 Golden Data を持つ。
- 可観測性: トレース ID, シンボル, interval を構造化ログに出力。メトリクスは Prometheus 互換形式。

## 4. タスクリスト (TDD ステップ)
1. **スキーマ & マイグレーション**
   - Red: Prisma スキーマテストで market_prices / market_statistics / recompute_jobs が欠落していることを検知。
   - Green: Prisma Schema とマイグレーション、RLS ポリシー SQL を実装。
   - Refactor: インデックスと制約の命名を整備。

2. **価格収集ワーカー**
   - Red: MSW モックで Polygon API 呼び出しテスト、データ正規化テストを追加。
  - Green: Fetch 実装、エラーハンドリング、Circuit Breaker、バルク挿入。
   - Refactor: HTTP クライアント構成を共有ライブラリ化。

3. **GET /market/prices**
   - Red: 正常ケース・validation 422 ケース・不存在シンボル 404 ケースのユニットテスト、契約テスト。
   - Green: ルータ実装、Prisma クエリ、キャッシュ。
   - Refactor: レスポンス整形ユーティリティを抽出。

4. **GET /market/statistics/top10**
   - Red: 最新統計返却テスト、Universe 未同期 404 テスト。
   - Green: 統計取得実装、KV キャッシュ、traceparent 継承。
   - Refactor: 統計フォーマッタをモジュール化。

5. **統計再計算ジョブ (POST /market/recompute + ワーカー)**
   - Red: RBAC テスト、競合 409 テスト、Durable Object ジョブ状態テスト。
   - Green: Durable Object 実装、Queue へのジョブ投入、Python WASM 呼び出し。
   - Refactor: ジョブ状態共通モデル化。

6. **イベント連携**
   - Red: UniverseUpdated 受信時に新銘柄追加と古い銘柄削除を検証するテスト。
   - Green: Queue ハンドラ実装、差分更新ロジック。
   - Refactor: 差分計算ユーティリティを抽出。

7. **監査・メトリクス**
   - Red: 構造化ログとメトリクス (market_requests_total, price_fetch_failures_total) テスト。
   - Green: Logger, Metrics 実装。
   - Refactor: ラベル設計を見直し。

## 5. テストと品質確認
- 単体テスト: Vitest + MSW。
- 数値検証: Pytest で共分散計算の Golden Data テスト。
- 契約テスト: uv run --link-mode=copy prism mock documents/MarketDataService_OpenAPI.yaml。
- 統合テスト: wrangler dev + Neon Branch を用いたエンドツーエンドテスト。
- 観測性テスト: ログとメトリクスが OpenTelemetry Collector に送信されることを確認。

## 6. リスクと緩和策
- 外部 API レート制限: Token Bucket 制御 + キャッシュで呼び出しを削減。
- 数値ドリフト: 共分散行列を定期比較し、閾値超過で警告。
- ジョブ失敗: 最大 3 回リトライ後に PagerDuty 通知。

## 7. 完了条件
- 3 API と収集・再計算ワーカーが設計・OpenAPI に準拠して動作。
- すべてのテストとリントがパス。
- マイクロサービス実装チェックリストの該当項目完了。
