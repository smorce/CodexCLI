# [Impl] Portfolio Optimization Service: Efficient Frontier API (TDD)

**課題:** PortfolioOptimizationService のジョブ/フロンティア/制約APIを仕様に従い、TDDとTidy First原則を厳守して実装する。

**参照:**
- 全体仕様: `documents/IndexFrontier_Architecture.md`
- 詳細設計: `documents/PortfolioOptimizationService_Design.md`
- API契約: `documents/PortfolioOptimizationService_OpenAPI.yaml`
- 実装計画: `documents/PortfolioOptimizationService_ImplPlan.md`
- SOW: `temp/portfolio-optimization.sow.md`

**作業内容:**
- **Tidy First / セットアップ**
  - `packages/portfolio-optimization` の雛形作成、共通HTTPミドルウェア適用。
  - Drizzleスキーマ・マイグレーション生成（RLS・インデックス含む）。
  - Temporal/WASM/Queue/MarketData クライアントをポート経由で抽象化。
- **TDD サイクル厳守**
  1. Red: Constraintハンドラのユニットテスト → 201/422ケース。
  2. Red: `POST /jobs` エンドツーエンドテスト（Temporal mock）。
  3. Red: 認証・権限制御 (401/403) 共通ミドルウェアテスト。
  4. Red: Job重複409、目標リターン範囲422。
  5. Red: `GET /jobs/{id}` / `GET /frontiers` / `GET /frontiers/{id}` フィルタ・404ケース。
  6. Red: Temporal完了イベント処理 → frontier保存 → Queue outbox 記録。
  7. Red: WASM Optimizer adapter contract。
  8. 各RedテストをGreen化後にRefactor。構造変更と振る舞い変更は別コミット。
- **ドメイン/インフラ実装**
  - コマンド/クエリハンドラをヘキサゴナルアーキテクチャで実装。
  - Temporal `FrontierWorkflow` を起動し、WASM OptimizerをDurable Object経由で実行。
  - Outboxパターンで `frontier.completed` / `frontier.failed` を Cloudflare Queues に配信。
  - 市場データ取得のキャッシュ（KV）と整合性チェックを含める。
- **テスト & 観測性**
  - ユニット／統合／Contractテスト（Prism）。
  - Temporal/E2Eテストでリトライポリシー確認。
  - OpenTelemetry span属性（`job_id`, `constraint_set_id`）のテスト。
  - AuditLog、レート制限、エラーパスなどをカバー。

**完了条件:**
- OpenAPI・設計に完全一致するエンドポイントが実装され、CI（lint, unit, contract, integration）がGreen。
- Temporalワークフローと WASM Optimizer が本番Secretsで動作し、Outboxイベントがキューに配信される。
- RLSを含むDrizzleマイグレーションとSQLFluffがパス。
- コミットは論理単位で、Tidy (構造変更) と機能追加を分離。
