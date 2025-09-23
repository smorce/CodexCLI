# MarketDataService Implementation Plan

## 1. 概要
- 目的: Top10 銘柄の価格・リターン・共分散データを収集・加工し、Design/OpenAPI の API を提供。
- 範囲: REST ハンドラ、Durable Object ingest coordinator、Wasm 最適化ロジック、Prisma スキーマ、Queue 発行。

## 2. セットアップ
- Prisma schema に market_data テーブル群を追加 (別コミットでマイグレーション)。
- Rust → Wasm の計算モジュールを packages/optimization-core に追加。uv toolchain でビルド、Workers にバンドル。
- Cloudflare Queues emulator を起動しテスト基盤を整備。

## 3. テスト戦略
- ユニット: Handler validation, parameter parsing, Wasm インターフェース。
- 統合: Prisma + shadow DB, ingestion pipeline (Polygon モック), RLS enforcement。
- プロパティテスト: Covariance 行列が対称正定値であることを QuickCheck で検査。
- パフォーマンステスト: k6 で /returns と /covariance の p95 を測定。

## 4. 実装手順
### 4.1 Tidy First
- 共通ユーティリティ (JWT → org_id 変換、Cache ラッパー) に不足があれば追加。
- 既存 Monitoring ミドルウェアに MarketData 用メトリクスタグを追加。

### 4.2 API 実装 (Red → Green → Refactor)
1. GET /returns
   - Red: symbols 未指定で 422、maxItems>10 で 422、成功レスポンス構造テスト。
   - Green: Prisma クエリ + DTO 生成。
   - Refactor: キャッシュ層抽出、ReturnPoint シリアライザ共通化。
2. GET /covariance
   - Red: windowDays 未指定で 422、enum 不正で 422、成功時の JSON 形式検証。
   - Green: Wasm モジュール呼び出し、JSON 出力。
   - Refactor: 結果キャッシュ (R2 + Cache API)、メトリクスタグ整備。
3. GET /statistics
   - Red: 期待リターン計算テスト、eta null 設定の境界ケース。
   - Green: Prisma 集約 + Wasm 計算。
   - Refactor: テーブルアクセス共通化。
4. POST /ingest
   - Red: 権限チェックテスト (403)、進行中ジョブで 409。
   - Green: Durable Object 状態管理 + Queue 発行 + 外部 API 呼び出し。
   - Refactor: リトライとバックオフ設定抽出。
5. GET /health
   - Red: Queue 深度が数値で返ること、フィールド欠落時のデフォルト値。
   - Green: Durable Object + Queue API から情報取得。
   - Refactor: Health DTO 共通化。

### 4.3 バッチ処理
- Red: Polygon モックから 1000 バーを取得するエンドツーエンドテスト。
- Green: 外部 API クライアント + 保存処理実装。
- Refactor: Chunking / Rate Limit 対応を構成ファイル化。

## 5. データ移行
- 初回は IndexConstituentService の seed に依存。MarketDataService 側は空テーブルを作成。
- covariance_matrices は初回 ingestion 後に計算。バックフィルスクリプトを issue 化。

## 6. 完了条件
- OpenAPI 契約テスト、Wasm 計算の精度テスト、Queue イベントの検証を全てパス。
- パフォーマンス閾値を満たす (p95 < 200ms, CPU < 200ms/req on Workers)。
- 監査ログ (ingest ジョブ) が BigQuery に送信される。
