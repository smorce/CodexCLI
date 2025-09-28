# SOW: Market Data Service

## 1. タスク概要
- 目的: トップ 10 銘柄の価格データ収集と統計 API を実装し、Portfolio Optimization に必要な入力を提供する。
- ゴール: MarketDataService_Design / OpenAPI / ImplPlan に準拠した 3 API と収集・再計算ワーカーを TDD で完成させる。

## 2. 設計パターンの検討
### 2.1 要点の整理
- 外部マーケットデータ API のレート制限・フェイルオーバー。
- 共分散行列など計算の数値安定性。
- Universe 更新イベントに応じた銘柄追加・削除。
- 高速読み取りのためのキャッシュ戦略。

### 2.2 候補パターン
1. **Ingestion Pipeline + Durable Object バッファ**
2. **Event Sourcing で履歴保持**
3. **CQRS + Read/Write 分離**
4. **シンプルなバッチ処理のみ**

### 2.3 比較
- Pipeline + Durable Object: 外部 API 呼び出しをバッファし、再試行制御が容易。設計書の Queue 利用と一致。
- Event Sourcing: 履歴管理には有効だが現在要件では過剰。
- CQRS: 読み取り最適化に有効、Statistics API の SLA に適合。
- シンプルバッチ: 失敗時のリカバリやイベント連携が弱い。

### 2.4 最終決定
- **採用パターン**: Durable Object を用いた Ingestion Pipeline + CQRS キャッシュ。
- **理由**: 外部 API 集約とレート制御を Durable Object が担い、読み取りは KV キャッシュで高速化できるため。冗長な Event Sourcing は不要。

## 3. 実装計画 (TDD)
1. Prisma スキーマ追加 → テスト/マイグレーション。
2. 価格収集ワーカー (MSW モック) → 実装 → Refactor。
3. GET /market/prices → テスト → 実装 → Refactor。
4. GET /market/statistics/top10 → テスト → 実装。
5. POST /market/recompute + Durable Object → テスト → 実装。
6. UniverseUpdated イベントハンドラ → 差分更新実装。
7. 観測性 (ログ/メトリクス) → 実装。

## 4. ユーザー向けタスクリスト
- Polygon.io (または指定プロバイダ) の API キーを環境変数 POLYGON_API_KEY に設定。
- Fallback 用の API キー (例: FMP) を Secrets Manager に登録。
- Cloudflare Workers の Cron Trigger と Queue バインディングを設定。
- Python WASM (PyPortfolioOpt) ビルド用の uv toolchain を準備。

## 5. 合意事項
- 上記計画に沿って Market Data Service 実装を進める前に承認を得る。
