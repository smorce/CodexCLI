# PortfolioInsightsService Design

## 概要 / 責務 / 境界
- **責務**: PortfolioOptimizationServiceの出力を集約し、ダッシュボード/API/通知向けに可視化・分析・コンプライアンスレポートを提供。効率的フロンティアの状態監視とアラート発火を担う。
- **境界**: 計算処理は行わず、既存フロンティアやシナリオ分析結果を参照。ユーザー設定通知やWebSocket配信を管理。
- **利用者**: ポートフォリオマネージャ、リスク管理チーム、コンプライアンス部門。

## API 一覧
| Method | Path | 目的 |
| --- | --- | --- |
| GET | /insights/frontiers/latest | テナントの最新フロンティアサマリ取得 |
| GET | /insights/frontiers/{frontierId}/curve | 指定フロンティアのポイント列取得 |
| GET | /insights/allocations | 最新推奨ウェイトと寄与度 |
| POST | /insights/scenarios | ストレスシナリオの評価結果生成 |
| GET | /insights/compliance | コンプライアンス逸脱状況、ドリフト指標 |
| GET | /stream/token | WebSocket購読用トークン発行 |

### エンドポイント詳細
#### GET /insights/frontiers/latest
- **クエリ**: `constraintSetId` optional。
- **レスポンス**: 最新フロンティアのSharpe、Volatility、ターゲットウェイト。
- **キャッシュ**: Cloudflare KV 30秒TTL。

#### GET /insights/frontiers/{frontierId}/curve
- **レスポンス**: ポイントごとの`risk`,`expectedReturn`,`allocationSummary`。
- **監査**: 取得ログをAuditLogに記録。

#### GET /insights/allocations
- **クエリ**: `asOf`, `objective`。
- **レスポンス**: 推奨ウェイト、マージンリスク寄与、セクターブレークダウン。

#### POST /insights/scenarios
- **入力**: `scenarioType` (`rate_shock`, `vol_spike`, `custom`), `parameters` (JSON), `frontierId`。
- **処理**: Temporal `ScenarioWorkflow` を起動し、結果がReadyになったら WebSocket push。
- **レスポンス**: 202 + `scenarioId`。

#### GET /insights/compliance
- **レスポンス**: drift 指標、制約違反アラート、監査リンク。

#### GET /stream/token
- **目的**: WebSocket接続に利用する短期JWTを発行。
- **セキュリティ**: 5分有効、`portfolio_viewer`以上のロール必要。

## データモデル & スキーマ
- **insight_frontiers** (replicated from optimization)
  - `frontier_id` UUID PK
  - `tenant_id` UUID
  - `objective` text
  - `as_of` timestamptz
  - `summary_metrics` jsonb
- **insight_allocations**
  - `allocation_id` UUID PK
  - `frontier_id` FK
  - `symbol` text
  - `weight` numeric(10,6)
  - `marginal_risk` numeric(10,6)
  - `sector` text
- **scenarios**
  - `scenario_id` UUID PK
  - `tenant_id` UUID
  - `frontier_id` UUID
  - `scenario_type` text
  - `parameters` jsonb
  - `status` enum(`queued`,`running`,`completed`,`failed`)
  - `results` jsonb
  - `created_at`, `completed_at`
- **compliance_snapshots**
  - `snapshot_id` UUID PK
  - `tenant_id` UUID
  - `frontier_id` UUID
  - `drift_score` numeric(6,4)
  - `violations` jsonb
  - `generated_at`
- **stream_tokens**
  - `token_id` UUID PK
  - `tenant_id` UUID
  - `user_id` UUID
  - `expires_at` timestamptz
  - `scopes` text[]

### RLS
- `tenant_id = current_setting('app.tenant_id')`。
- `risk_manager` ロールはコンプライアンスエンドポイント使用可。`portfolio_viewer` は read-only。
- WebSocketトークン発行はユーザー自身の`user_id`のみ。

## 連携 / 依存関係
- PortfolioOptimizationService: `frontier.completed` イベントを購読し、insightテーブル更新。
- MarketDataService: 最新価格でドリフトスコアを再計算。
- Temporal ScenarioWorkflow: Stressテストを非同期実行。
- ClickHouse: 長期統計を照会。
- Notification Worker: 重大なコンプライアンス違反時にSlack/Email通知。

## セキュリティ / 認可 / レート制限 / 入力検証
- JWT + tenantヘッダ必須。
- レート制限: GET系 240 req/min、POST scenarios 20 req/hour。
- WebSocketトークンは HMAC署名＋5分有効期。
- Zod schema: シナリオパラメータを型検証、`rate_shock` では `bps` 範囲 -300〜300。

## エラーハンドリング
- 401/403: 認証・権限。
- 404: frontier/scenario not found。
- 409: scenario 重複提出。
- 422: パラメータ不正。
- 429: レート制限。
- 500: 内部エラーは correlationId を返却。

## 技術詳細
- Insights Worker exposes REST + GraphQL queries (GraphQL schema generated from same models).
- Durable Object `InsightStream` 管理 WebSocket セッション (fan-out to clients)。
- Drizzle ORM for Postgres; Streaming queries for curve points (JSON aggregate)。
- Outboxテーブル `insights_outbox` for notifications。
- Observability: span attributes `frontier_id`, `scenario_id`。
- Compliance snapshots recalculated via Temporal daily schedule。
