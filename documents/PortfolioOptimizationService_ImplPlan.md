# Portfolio Optimization Service 実装計画

## 1. 目的
- 効率的フロンティアおよび最適配分計算 API を TDD と Tidy First 原則で実装し、Market Data 由来の統計量を活用した確度の高い結果を提供する。

## 2. 前提条件
- Market Data Service が最新統計 API を提供している。
- documents/PortfolioOptimizationService_Design.md / PortfolioOptimizationService_OpenAPI.yaml を正とする。
- PyPortfolioOpt WASM モジュールがビルド可能である (uv build プロセス定義済み)。

## 3. 実装ポリシー
- すべての計算は決定論的にする (乱数種固定)。
- 大規模行列演算は WASM へオフロードし、Node 側では結果整形のみ。
- RBAC とレート制限をミドルウェア層で処理。
- エラーは ErrorResponse 形式に統一、traceId を必ず付与。

## 4. タスクリスト (TDD ステップ)
1. **スキーマとジョブ基盤**
   - Red: Prisma スキーマテストで optimization_jobs/optimization_results が欠落していることを検知。
   - Green: Prisma Schema, マイグレーション、RLS ポリシーを実装。
   - Refactor: ジョブ状態列挙を共通モジュール化。

2. **外部依存モック**
   - Red: Market Data API をモックするテストを追加。
   - Green: HTTP クライアント (retry, timeout) を実装。
   - Refactor: クライアント設定を config モジュールに抽出。

3. **POST /portfolio/efficient-frontier**
   - Red: 成功シナリオ、制約不正 422、重複ジョブ 409 のテスト。
   - Green: ルータ実装、Durable Object でジョブキューイング、Queue へジョブ投入。
   - Refactor: Payload バリデータを共通化。

4. **POST /portfolio/optimal-weights**
   - Red: 各 objectiveType の期待値テスト、targetValue 欠如時の検証。
   - Green: ルータとジョブ生成ロジック実装。
   - Refactor: 共有ロジック抽出。

5. **計算ワーカー**
   - Red: WASM 呼び出しテスト、Market Data フェッチ失敗時のリトライテスト。
   - Green: Queue コンシューマ実装、PyPortfolioOpt 呼び出し、結果保存。
   - Refactor: 結果整形と保存ロジックを分離。

6. **GET /portfolio/jobs/{jobId}**
   - Red: 成功・404・403 ケーステスト、traceId 伝播テスト。
   - Green: 状態取得実装、結果 URL 生成。
   - Refactor: レスポンスマッピングを共通化。

7. **イベント連携**
   - Red: PortfolioComputed イベント送出テスト。
   - Green: Insights Service 用イベントを Cloudflare Queues に発行。
   - Refactor: イベントスキーマ定義を共有。

8. **監査・メトリクス**
   - Red: メトリクス (optimization_job_duration_seconds, optimization_queue_depth) テスト、ログフォーマット検証。
   - Green: メトリクス導入、構造化ログ実装。
   - Refactor: Metric 名称整理。

## 5. テストと品質確認
- 単体テスト: Vitest。
- 数値回帰テスト: Pytest で WASM モジュールの結果を検証。
- 契約テスト: uv run --link-mode=copy prism mock documents/PortfolioOptimizationService_OpenAPI.yaml。
- 集約テスト: wrangler dev + Neon Branch、Queue をスタブ化して E2E 確認。
- パフォーマンステスト: k6 で p95 < 200ms を確認。

## 6. リスクと緩和策
- WASM 実行失敗: フォールバックとして Node 側で小規模計算、失敗時はジョブ再試行。
- データ整合性: Market Data snapshot の timestamp を検証し、古い場合は失敗として再計算をリトライ。
- ジョブ滞留: Queue Depth を監視し、しきい値超過で水平スケール。

## 7. 完了条件
- 2 API とジョブ状態参照、および計算ワーカーが設計/契約に準拠し動作。
- すべてのテスト・リント・負荷テストがパス。
- マイクロサービス実装チェックリストを満たす。
