# PortfolioAnalytics Service 詳細設計書

## 1. 概要 / 責務 / 境界
- 目的: S&P500 上位10銘柄の最新市場データから、効率的フロンティアやターゲット配分を算出し、利用者に対してリスク・リターン分析結果を提供する。
- 境界: 市場データ取得や銘柄選定は IndexConstituent Service と MarketData Service が担当し、本サービスはそれらの公開 API を利用する。ユーザー保存や通知は UserPortfolio/Notification Service に委任する。
- 提供機能:
  - 効率的フロンティア計算 (Markowitz Mean-Variance)。
  - 目標リターン・目標ボラティリティに応じた最適ウェイト導出。
  - 分散投資制約 (ウェイト合計=1、ショート禁止、銘柄毎最小/最大比率) の適用。
  - 計算ジョブの非同期管理と監査ログ出力。

## 2. API 一覧
| メソッド | パス | 用途 | 認証 | 主な入力 | 主な出力 |
| --- | --- | --- | --- | --- | --- |
| POST | /analytics/frontier | 効率的フロンティア計算ジョブの作成 | 必須 (Supabase JWT) | lookbackDays, rebalanceFrequency, riskFreeRate, constraintSets | jobId, status=pending, submittedAt |
| POST | /analytics/optimization | 目標指標に応じた最適配分ジョブの作成 | 必須 | objectiveType, objectiveValue, constraints | jobId, status |
| GET | /analytics/jobs/{jobId} | ジョブ状態と結果の取得 | 必須 | jobId パス | status, progress, frontierPoints[], optimalWeights, diagnostics |
| GET | /analytics/constraints | 適用可能な制約テンプレートの取得 | 必須 | なし | constraintTemplates[] |

### リクエスト/レスポンス概要
- POST /analytics/frontier
  - リクエスト: JSON (lookbackDays=90 default, samplingFrequency="daily", includeExDividend=true, maxAssets=10, constraints[ConstraintInput])
  - レスポンス: 202 Accepted + {"jobId": "UUID", "status": "pending", "estimatedCompletionSeconds": 45}
- POST /analytics/optimization
  - リクエスト: JSON (objectiveType="targetReturn"|"targetVolatility"|"maxSharpe", objectiveValue optional, constraints[])
  - レスポンス: 202 Accepted + {"jobId": "UUID", "status": "pending"}
- GET /analytics/jobs/{jobId}
  - 200 成功時: {"status": "succeeded", "submittedAt": "RFC3339", "startedAt": "RFC3339", "completedAt": "RFC3339", "frontier": [FrontierPoint], "solution": OptimizationSolution, "inputs": {...}, "telemetry": {"traceId": "UUID", "calcTimeMs": 820}}
  - 404: ジョブが存在しないかアクセス権なし。
  - 409: ジョブがまだ実行中。
  - 500: 内部エラー。
- GET /analytics/constraints
  - 200: {"constraintTemplates": [ConstraintTemplate]}

### エラー共通フォーマット
{"code": "string", "message": "説明", "traceId": "UUID", "details": {}}
コード例: AUTH_REQUIRED, VALIDATION_ERROR, JOB_NOT_FOUND, UPSTREAM_TIMEOUT。

## 3. データモデル & スキーマ
### テーブル: analytics_jobs
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK DEFAULT gen_random_uuid() | ジョブ識別子 |
| org_id | UUID | NOT NULL | 組織識別子 (RLS 判定) |
| user_id | UUID | NOT NULL | トリガーしたユーザー |
| job_type | TEXT | NOT NULL CHECK (job_type IN ('frontier','optimization')) | ジョブ種別 |
| status | TEXT | NOT NULL CHECK (status IN ('pending','running','succeeded','failed','cancelled')) | 実行状態 |
| input_payload | JSONB | NOT NULL | リクエストパラメータ完全保存 |
| result_payload | JSONB | NULL | 計算結果の概要 |
| error_payload | JSONB | NULL | 失敗時の詳細 |
| progress_pct | NUMERIC(5,2) | DEFAULT 0 | 実行進捗 (%) |
| trace_id | TEXT | NOT NULL | 分散トレーシング ID |
| issued_at | TIMESTAMPTZ | DEFAULT now() | 受領時刻 |
| started_at | TIMESTAMPTZ | NULL | 実行開始 |
| completed_at | TIMESTAMPTZ | NULL | 完了 |

インデックス: (org_id, id), status, issued_at DESC。
RLS: CREATE POLICY job_owner ON analytics_jobs USING (org_id = current_setting('app.current_org')::uuid AND user_id = auth.uid());
管理者向け: CREATE POLICY job_org_admin ON analytics_jobs FOR SELECT USING (org_id = current_setting('app.current_org')::uuid);

### テーブル: frontier_points
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK DEFAULT gen_random_uuid() | 1 レコード毎のポイント |
| job_id | UUID | NOT NULL REFERENCES analytics_jobs(id) ON DELETE CASCADE | 紐づくジョブ |
| point_index | INTEGER | NOT NULL | 0 起点、フロンティア上の並び |
| expected_return | NUMERIC(10,6) | NOT NULL | 期待収益率 |
| volatility | NUMERIC(10,6) | NOT NULL | 標準偏差 |
| sharpe_ratio | NUMERIC(10,6) | NOT NULL | (expected_return - risk_free) / volatility |
| weights | JSONB | NOT NULL | {"ticker": weight} 形式 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 登録時刻 |

インデックス: (job_id, point_index) UNIQUE。
RLS: CREATE POLICY frontier_points_owner ON frontier_points USING (job_id IN (SELECT id FROM analytics_jobs WHERE org_id = current_setting('app.current_org')::uuid));

### テーブル: optimization_solutions
| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| id | UUID | PK DEFAULT gen_random_uuid() | ソリューション ID |
| job_id | UUID | UNIQUE NOT NULL REFERENCES analytics_jobs(id) ON DELETE CASCADE | 1 ジョブ 1 ソリューション |
| target_type | TEXT | NOT NULL | targetReturn など |
| target_value | NUMERIC(10,6) | NULL | 目標値 |
| achieved_return | NUMERIC(10,6) | NOT NULL | 達成収益率 |
| achieved_volatility | NUMERIC(10,6) | NOT NULL | 達成ボラティリティ |
| sharpe_ratio | NUMERIC(10,6) | NOT NULL | シャープレシオ |
| weights | JSONB | NOT NULL | 配分結果 |
| diagnostics | JSONB | NULL | イテレーション、KKT 条件等 |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

追加リソース: materialized view frontier_point_latest で直近成功ジョブのサマリ提供。
Supabase Storage へ結果 CSV/PDF を保存する場合は署名付き URL を返却。

## 4. 連携 / 依存関係
- IndexConstituent Service: GET /constituents/top10 で最新銘柄と時価総額を取得 (ETag / 5 分キャッシュ)。
- MarketData Service: GET /market-data/prices?tickers=...&lookbackDays=... で調整後終値を取得。失敗時は指数バックオフで再試行。
- UserPortfolio Service: GET /users/{id}/preferences で制約テンプレート・リスク許容度を取得。
- Cloudflare Queues: analytics.job.created / analytics.job.completed / analytics.job.failed イベントを発行し、他サービスが購読。
- Stripe Usage Records: 計算時間ごとにクレジット消費を記録 (最小課金 0.1 クレジット/ジョブ)。

## 5. セキュリティ / 認可 / レート制限 / 入力検証
- 認証: Supabase JWT (audience=sp-top10-api)。BFF と Workers 双方で署名・exp・ロールを確認。
- 認可: org_id クレーム必須。Neon セッション変数 app.current_org に設定し RLS を適用。管理者のみ他ユーザージョブを参照可。
- レート制限: POST /analytics/frontier は ユーザー毎 30 req/h、組織毎 200 req/h。Cloudflare Turnstile と KV ベースのトークンバケットで制御。
- 入力検証: BFF で Zod、サービスで Valibot。lookbackDays は 7〜365、riskFreeRate は -0.05〜0.15、ウェイト上限 0.4、下限 0。
- 監査: 全ジョブ操作を analytics_jobs.result_payload 内 trace_id と紐付け、Supabase Audit Log にも記録。

## 6. エラーハンドリング方針
- 401/403: JWT 無効または権限不足。
- 404: ジョブ未存在 (RLS により不可視の場合も 404)。
- 409: ジョブが実行中で結果未確定。
- 422: 入力値バリデーション失敗、details.invalidFields にフィールド配列。
- 429: レート制限超過、Retry-After ヘッダーを付与。
- 500: 依存サービス障害時は Cloudflare Queues Dead Letter に送信し再実行ポリシーを適用。

## 7. 技術詳細
- 実装言語: TypeScript (Cloudflare Workers) + Rust モジュール (napi-rs) で線形代数を高速化。
- アルゴリズム: 平均ベクトル μ は対数収益率の幾何平均、共分散行列 Σ は Newey-West 推定 (ラグ=5)。効率的フロンティアは二次計画法 (QP) で 51〜250 ポイントを生成。
- キャッシュ: MarketData から取得した時系列を 5 分間 Durable Object にキャッシュし、入力セットハッシュ (SHA256) で再利用。
- スケジューラ: Supabase Cron (15 分間隔) で前営業日の再計算ジョブを自動実行し UserPortfolio Service に同期。
- トレーシング: Traceparent ヘッダーを継承し、Neon 拡張 pg_stat_statements でクエリ監査。
- 可用性: Durable Object を多リージョン配置し、Neon フェイルオーバーと連携。

## 8. テスト戦略
- 単体テスト: 制約検証ロジック、QP ソルバー境界ケース、MarketData 障害時フォールバック。
- 統合テスト: BFF からのエンドツーエンド (Index/Market サービスをモック)。
- プロパティテスト: 重複ティッカーや極端リスクフリーレートでの結果妥当性。
- パフォーマンステスト: 10 銘柄・252 日分で 1 秒以内にフロンティア 50 ポイント生成を目標。
- 回帰テスト: 過去 30 日の計算結果を固定シードで比較し、差分が ±1bps 超過で警告。
