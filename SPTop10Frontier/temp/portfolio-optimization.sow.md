# SOW: Portfolio Optimization Service

## 1. タスク概要
- 目的: 効率的フロンティアと最適配分計算 API、および計算ジョブ処理基盤を実装する。
- ゴール: OpenAPI に準拠した 3 エンドポイントと Queue ベースの計算ワーカーを TDD で整備する。

## 2. 設計パターンの検討
### 2.1 要点
- 計算ジョブの非同期処理と冪等性。
- Market Data 依存性の安定確保。
- 数値計算を WASM に委譲。
- 結果再利用のためのキャッシュとイベント発行。

### 2.2 候補
1. **Durable Object キュー + WASM ワーカー (推奨)**
2. **同期計算 (HTTP ブロッキング)**
3. **Serverless Batch (外部ジョブサービス)**
4. **Stream Processing (Kafka 等)**

### 2.3 比較
- Durable Object キュー: 設計書方針と一致。ジョブ制御が容易。
- 同期計算: p95 < 200ms に収めづらく、タイムアウトリスク大。
- Serverless Batch: 強力だがコスト高・レイテンシ高。
- Stream Processing: 過剰な複雑性。

### 2.4 最終決定
- **採用**: Durable Object + Queue + WASM。
- **理由**: 非同期制御が容易でレイテンシ要求を満たし、Cloudflare 上で閉じる構成。

## 3. 実装計画 (TDD)
1. Prisma スキーマ/マイグレーション。
2. Market Data クライアントモック → HTTP クライアント実装。
3. POST /portfolio/efficient-frontier → テスト → 実装。
4. POST /portfolio/optimal-weights → テスト → 実装。
5. Queue コンシューマ (WASM 呼び出し) → テスト → 実装。
6. GET /portfolio/jobs/{id} → テスト → 実装。
7. PortfolioComputed イベント発行・観測性 → テスト → 実装。

## 4. ユーザー向けタスクリスト
- PyPortfolioOpt WASM のビルド済みアーティファクトを提供 (uv build + wasm-pack)。
- Neon 側で pgvector 拡張を有効化。
- Cloudflare Queue/Durable Object のバインディングを追加。
- Datadog メトリクスのネームスペース設定。

## 5. 合意事項
- 本 SOW の承認後に実装を開始。
