# OptimizationService Detailed Design

## 1. 概要 / 責務 / 境界
- MarketDataService の統計量を入力として、平均分散最適化 (Markowitz)・効率的フロンティア・制約遵守を行う。
- 非同期ジョブ管理を行い、完了時に PortfolioManagementService に通知。
- フロンティア計算結果 (50 点のリスク vs. リターン) を保存し、再利用や監査に提供。

境界:
- 原資産データ取得は行わず MarketDataService に依存。
- 投資方針や承認ワークフローは PortfolioManagementService に委譲。

## 2. API 一覧
| メソッド | パス | 目的 |
|---|---|---|
| POST | /v1/optimization/jobs | 最適化ジョブを作成し非同期実行 |
| GET | /v1/optimization/jobs/{jobId} | ジョブステータスと結果を取得 |
| POST | /v1/optimization/jobs/{jobId}/cancel | 実行中ジョブをキャンセル |
| GET | /v1/optimization/frontier | 最新フロンティアのサマリポイントを取得 |
| POST | /v1/optimization/frontier/preview | 同期的に軽量フロンティア計算 (制約チェックのみ) |

### 2.1 エンドポイント詳細
1. POST /jobs
    - リクエスト: OptimizationRequest
      `json
      {
        "objective": "MAX_SHARPE",
        "riskFreeRate": 0.045,
        "constraints": {
          "minWeightPerSymbol": 0,
          "maxWeightPerSymbol": 0.25,
          "targetVolatility": null,
          "sectorCaps": {
            "Information Technology": 0.4
          }
        },
        "universe": ["AAPL","MSFT","NVDA"],
        "asOf": "2025-09-23"
      }
      `
    - レスポンス: { jobId, status }
    - 動作: Durable Object OptimizationCoordinator に enqueue。Queue optimization.completed で完了通知。
2. GET /jobs/{jobId}
    - レスポンス: ジョブステータス、エラー、結果 (frontier, allocations)。
3. POST /jobs/{jobId}/cancel
    - 条件: status IN (QUEUED, RUNNING)。
    - レスポンス: { jobId, status: "CANCELLED" }
4. GET /frontier
    - クエリ: sOf, objective。
    - レスポンス: 最新成功ジョブのフロンティア要約 (10 点: min risk → max return)。
5. POST /frontier/preview
    - リクエスト: OptimizationRequest (軽量版)。
    - レスポンス: 制約可否、推定リターン/リスク (計算時間 1 秒以内)。

エラー形式: 共通 ErrorResponse。

## 3. データモデル & スキーマ
Neon optimization schema。
- optimization_jobs
    - job_id UUID PK
    - org_id UUID
    - status TEXT (QUEUED|RUNNING|SUCCEEDED|FAILED|CANCELLED)
    - objective TEXT (MAX_RETURN|MIN_RISK|MAX_SHARPE)
    - equest_payload JSONB
    - esult_summary JSONB
    - error_detail JSONB
    - queued_at, started_at, completed_at
- rontier_points
    - point_id UUID PK
    - job_id UUID FK
    - sequence SMALLINT (0..49)
    - expected_return NUMERIC(10,6)
    - olatility NUMERIC(10,6)
    - sharpe_ratio NUMERIC(10,6)
    - weights JSONB (symbol -> weight)
- llocation_recommendations
    - llocation_id UUID PK
    - job_id
    - label TEXT (例: target risk)
    - weights JSONB
    - metrics JSONB (expectedReturn, volatility)

RLS: org_id = auth.uid()。

Durable Object: OptimizationCoordinator
- 状態: キュー (FIFO), 最大並列 5。
- 外部サービス: Workers Unbound + Rust Wasm モジュール optimization-core。

## 4. 連携 / 依存関係
- MarketDataService: REST で GET /statistics, GET /covariance。
- PortfolioManagementService: 完了イベントを Queue で通知 (optimization.completed with jobId, orgId, summary).
- Supabase Auth: org_id, user_id, oles 取得。

## 5. セキュリティ / レート制限 / 入力検証
- POST /jobs 300 req/日 / org。
- POST /jobs/{jobId}/cancel 60 req/分。
- 入力検証: universe は 2〜10 銘柄。maxWeightPerSymbol >= minWeightPerSymbol。	argetVolatility は (0, 1)。
- 役割: ole=analyst 以上がジョブ作成。ole=viewer は GET のみ。

## 6. エラーハンドリング
- 401/403/404/409/422/429/500。
- 409: キュー容量超過、同一 universe + objective のジョブが進行中。
- 422: 非正定値行列、制約矛盾 (例: sector cap < min weight 合計)。
- 500: 計算エンジン内部エラー。

## 7. 技術詳細
- 数値計算: Rust + nalgebra, finitediff, optimization by Sequential Quadratic Programming。Wasm で Workers Unbound から呼び出し。
- スナップショット: Frontier 50 点 + 3 推奨ポートフォリオ (min variance, max Sharpe, user target)。
- キャッシュ: 成功ジョブ結果を R2 に JSON として保存し、GET /frontier でヒットしたら返す。
- テレメトリ: 計算時間、行列コンディション番号、失敗率をメトリクス収集。
- テスト: 数値再現性テスト (固定シード), 制約プロパティテスト, Golden dataset (Markowitz sample) との比較。
