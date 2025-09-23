# PortfolioOptimizationService Implementation Plan (TDD)

## スコープ
- OpenAPI Endpoints `/jobs`, `/frontiers`, `/constraints` を実装。
- Temporal `FrontierWorkflow` 呼び出し、WASM最適化アクティビティ、Cloudflare Queues イベント発行。
- Neon スキーマ整備と RLS.

## 前提条件
- MarketDataService API クライアントが `packages/common/clients/market-data.ts` として提供される。
- PyPortfolioOpt + NumPy + Pandas を Pyodide/WASM ビルド済み（`dist/optimizer.wasm`）。
- Shared logging & metrics 中間層が存在。

## Tidy First
1. `packages/portfolio-optimization` ディレクトリを生成し、Honoアプリ構成／共通ミドルウェア適用。
2. `domain/commands` (`SubmitJobCommand`, `UpsertConstraintCommand`) と `domain/models` を作成。
3. Temporal クライアントラッパ (`infra/temporalClient.ts`) と WASM呼び出しアダプタ整備。
4. Drizzle schema (`schema/optimization.ts`) を定義。マイグレーション雛形生成。

## TDD サイクル
1. **Red**: `POST /constraints` 成功テスト（新規作成→201）とバリデーション失敗→422。
   - Green: Constraint repository + service 実装。
   - Refactor: バリデーション共通化。
2. **Red**: `POST /jobs` ハッピーパスで Temporal クライアントが呼ばれることをモック確認。
   - Green: Command handler 実装、RLS context 渡し。
   - Refactor: MarketData client をインターフェース抽出。
3. **Red**: 同エンドポイントで未承認ロール→403。
4. **Red**: 目標リターンが制約外で422。
5. **Red**: `GET /jobs/{jobId}` 完了ジョブレスポンスがフロンティアIDを含む。
   - Green: Repository + DTO 実装。
6. **Red**: `GET /frontiers` フィルタ + ページングテスト。
   - Green: クエリビルダ整備。
7. **Red**: `GET /frontiers/{id}` 404 ケース。
8. **Red**: Temporal Workflow 完了イベントで `frontiers` レコードが生成され、Queue への outbox 記録を検証する統合テスト。
9. **Red**: WASM Optimizer アダプタユニットテスト（入力→出力シェイプ検証）。
10. **Red**: 認証なしアクセスで401。

## 非機能テスト
- Contract tests (Prism) で OpenAPI差分検証。
- Temporal integration test (テスト用 namespace) で workflow retry / timeout ケース。
- Optimizerパフォーマンステスト：Pyodide 実行が SLA 内に収まるか軽量ベンチマーク。

## 観測性
- OpenTelemetry span attributes (`job_id`, `constraint_set_id`) をユニットテストで確認。
- Auditログ: すべてのジョブ状態遷移でレコード作成をテスト。

## 完了条件
- `uv run --link-mode=copy pnpm test --filter portfolio-optimization` が Green。
- Drizzle マイグレーションにインデックス、RLS、シーケンスが含まれる。
- Temporal ワークフローのデプロイ手順 (README) をIssueに追記。
- OpenAPI コントラクトテスト成功、Queue イベント (frontier.completed) が確認。
