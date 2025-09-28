# Portfolio Optimization Service 詳細設計書

## 1. 概要・責務・境界
- Market Data Service が提供する統計量を用いて効率的フロンティア、最適配分、制約付きポートフォリオ分析を実行する計算サービス。
- 要求された計算ジョブをキューで受け取り、Python WASM 実行環境で解析し、Portfolio Insights Service へ通知する。
- ユーザー固有の制約・ブラックリストを扱い、結果を一時保存する。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| POST | /portfolio/efficient-frontier | 効率的フロンティア計算 | 必須 | JSON: weightsConstraint, steps | JSON: frontierPoints | 401, 403, 404, 409, 422, 429, 500 |
| POST | /portfolio/optimal-weights | 目標リターン/リスク下での最適配分 | 必須 | JSON: objectiveType, targetValue, constraints | JSON: optimalWeights | 401, 403, 404, 409, 422, 429, 500 |
| GET | /portfolio/jobs/{jobId} | 計算ジョブ状態取得 | 必須 | パス: jobId | JSON: status, resultRef | 401, 403, 404, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: optimization_jobs
- id (UUID, PK)
- workspace_id (uuid)
- user_id (uuid)
- job_type (text: FRONTIER, OPTIMAL)
- payload (jsonb)
- status (enum)
- result_location (text, nullable)
- created_at, started_at, finished_at (timestamptz)
- trace_id (text)
- indexes: (workspace_id, created_at), (status, created_at)

### テーブル: optimization_results
- id (UUID, PK)
- job_id (UUID FK)
- summary (jsonb)
- frontier_points (jsonb)
- optimal_weights (jsonb)
- checksum (text)
- expires_at (timestamptz)

RLS ポリシー
- optimization_jobs: workspace_id = auth.jwt() の claim workspace_id。
- optimization_results: job_id 経由で対応する workspace のみ参照。

## 4. 連携・依存関係
- Market Data Service から最新 statistics を REST 取得。
- 計算ワーカーは Python (PyPortfolioOpt) を WASM 経由で呼び出し。
- Portfolio Insights Service へ PortfolioComputed イベントを送信。
- Notification Orchestrator に結果通知を依頼。
- Supabase Auth JWT から RBAC を評価。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT。
- 認可: Viewer は過去結果参照のみ、Analyst 以上が新規計算実行可。Admin/PM がハード制約のテンプレート管理。
- レート制限: 計算リクエストは 20 req/時/ワークスペース。ジョブ監視は 120 req/分/ユーザー。
- 入力検証: weightsConstraint の sum 1 ± 1e-6、ステップ数 10〜100、objectiveType は RETURN_MAX, RISK_MIN, SHARPE_MAX。
- データ検証: Market Data snapshot が 15 分以内であるか確認。

## 6. エラーハンドリング方針
- 401/403: 認証・認可違反。
- 404: jobId 不明またはアクセス権なし。
- 409: 同一 payload のジョブ重複 (重複防止)。
- 422: 入力制約不正 (例: weight sum ≠ 1)。
- 429: レート制限。
- 500: WASM 実行失敗や Market Data 依存障害。
- エラー形式: { code, message, traceId, details? }

## 7. 技術詳細
- ランタイム: TypeScript + Hono。計算は Cloudflare Workers から WASM Python モジュールを呼び出し。
- ジョブ管理: Durable Object でキューイング。Cloudflare Queues でバックグラウンド処理。
- 計算: PyPortfolioOpt (efficient_frontier, CLA) + numpy。WASM 化モジュールを uv build。
- キャッシュ: 計算結果を Cloudflare R2 に JSON で保存し、result_location に署名付き URL を保存。
- 可観測性: Job duration, queue length をメトリクス化。
- テスト: Vitest (API)、Pytest (数値)、契約テスト (Prism)、負荷テスト (k6) で p95 を確認。
