# PortfolioOptimizationService Design

## 概要 / 責務 / 境界
- **責務**: トップ10銘柄を対象とした効率的フロンティア計算、制約・シナリオ管理、Temporalワークフローを用いたジョブ実行、結果永続化。
- **境界**: 最適化の入力はMarketDataServiceから受領。洞察配信やレポーティングはPortfolioInsightsServiceへ連携。
- **利用者**: リサーチアナリスト、ポートフォリオマネージャ、外部APIクライアント。

## API 一覧
| Method | Path | 目的 |
| --- | --- | --- |
| POST | /jobs | 効率的フロンティア計算ジョブの作成 |
| GET | /jobs/{jobId} | ジョブ状態・結果取得 |
| GET | /frontiers | 最新フロンティア一覧（ページング） |
| GET | /frontiers/{frontierId} | フロンティア詳細とウェイト曲線取得 |
| POST | /constraints | テナント固有の制約セット登録/更新 |
| GET | /constraints | 有効な制約セット一覧取得 |

### エンドポイント詳細
#### POST /jobs
- **入力**: `constraintSetId`, `objective` (`max_sharpe`, `min_variance`, `target_return`), `targetReturn` (optional), `riskModel` (`historical`, `ewma`), `rebalanceFrequency`。
- **処理**: Temporal `FrontierWorkflow` を起動。MarketDataServiceから最新トップ10を取得し、最適化ジョブをキューに投入。
- **レスポンス**: 202 + `jobId`。

#### GET /jobs/{jobId}
- **出力**: 状態(`queued`,`running`,`completed`,`failed`), 進捗, Frontier結果サマリ, エラーログ。

#### GET /frontiers
- **クエリ**: `constraintSetId`, `objective`, `fromDate`, `toDate`, `page`, `pageSize`。
- **レスポンス**: フロンティアメタデータ配列。

#### GET /frontiers/{frontierId}
- **内容**: 効率的フロンティアのポイント集合（risk, return, weight allocation）、感度分析。

#### POST /constraints
- **入力**: `constraintSetId`, `maxWeightPerAsset`, `minWeightPerAsset`, `turnoverLimit`, `exclusions[]`, `customInequalities`。
- **検証**: max/min weight の和が1以上/0以下にならないようチェック。

#### GET /constraints
- **レスポンス**: アクティブ制約セット一覧（バージョン履歴含む）。

## データモデル & スキーマ
- **optimization_jobs**
  - `job_id` UUID PK
  - `tenant_id` UUID
  - `constraint_set_id` UUID
  - `objective` text
  - `target_return` numeric(8,4)
  - `risk_model` text
  - `status` text enum(`queued`,`running`,`completed`,`failed`)
  - `progress_pct` numeric(5,2)
  - `workflow_id` text
  - `started_at`, `completed_at`, `created_at`
  - `error_code`, `error_message`
- **frontiers**
  - `frontier_id` UUID PK
  - `tenant_id` UUID
  - `job_id` UUID FK
  - `objective` text
  - `constraint_set_id` UUID
  - `as_of` timestamptz
  - `points` jsonb (array of risk/return)
  - `covariance_snapshot_id` UUID
  - `metrics` jsonb (sharpe, volatility, expectedReturn)
- **frontier_allocations**
  - `allocation_id` UUID PK
  - `frontier_id` FK
  - `point_index` int
  - `symbol` text
  - `weight` numeric(10,6)
- **constraint_sets**
  - `constraint_set_id` UUID PK
  - `tenant_id` UUID
  - `version` int
  - `max_weight_per_asset` numeric(10,6)
  - `min_weight_per_asset` numeric(10,6)
  - `turnover_limit` numeric(10,6)
  - `exclusions` text[]
  - `custom_inequalities` jsonb
  - `is_active` bool
  - `valid_from`, `valid_to`
- **covariance_snapshots**
  - `snapshot_id` UUID PK
  - `tenant_id` UUID
  - `as_of` timestamptz
  - `symbols` text[]
  - `matrix` bytea (packed upper triangle)

### RLS
- すべて `tenant_id = current_setting('app.tenant_id')`。
- `portfolio_admin` が制約登録・ジョブ実行可能、`portfolio_viewer` は結果閲覧のみ。
- Temporal Workerは service role `system_tenant` を使用し cross-tenant操作不可。

## 連携 / 依存関係
- MarketDataService: `constituents.top-ten` API + `prices.snapshot` イベントを購読。
- Temporal Cloud: `FrontierWorkflow`, `FrontierActivity` で最適化処理。WASM最適化実行は Workers Durable Object `OptimizerRunner`。
- Cloudflare Queues: `frontier.completed`, `frontier.failed` イベントを PortfolioInsightsService へ配信。
- WASM Optimizer: PyPortfolioOpt & NumPy compiled via Pyodide, invoked with up-to-date covariance matrix。
- ClickHouse: Frontier結果をレポート用途でレプリケート。

## セキュリティ / 認可 / レート制限 / 入力検証
- JWT + `X-Tenant-Id` 必須。
- レート制限: `POST /jobs` 30 req/hour/tenant、`GET`系列 200 req/min。
- Zod schema: 目標リターン範囲0〜0.5、最大ウェイト≤1、最小ウェイト≥0。
- Temporal呼び出しには mTLS 証明書。
- 署名付きジョブペイロード: covariance snapshotハッシュ検証。

## エラーハンドリング
- 400: 制約不整合。
- 401/403: 認証・権限。
- 404: job/frontier/constraint not found。
- 409: 制約セットバージョン競合、ジョブ重複。
- 422: バリデーション失敗。
- 500: Optimizer例外（correlationId付与）。

## 技術詳細
- Worker -> Durable Object で最適化ジョブキュー制御、同時実行数を制限。
- OptimizerWASM: `uv run --link-mode=copy python build_optimizer.py` でビルド。
- Drizzle ORM + stored procedures for covariance retrieval。
- Outbox `optimization_outbox` + バッチ。
- OpenTelemetry: span attributes `job_id`, `objective`, `constraint_set_id`。
- Retryポリシー: Temporalで指数バックオフ (max attempts 3)。
