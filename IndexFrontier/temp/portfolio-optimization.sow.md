# Statement of Work: PortfolioOptimizationService

## 1. タスク概要
- **目的**: PortfolioOptimizationService の効率的フロンティア計算API群（ジョブ作成、結果取得、制約管理）を仕様/TDD/Tidy Firstに従って実装できる状態にする。
- **範囲**: OpenAPIエンドポイント実装、Temporalワークフロー連携、WASMオプティマイザ呼び出し、Outboxイベント配信、監査・観測性整備。

## 2. 設計パターンの検討
### 2.1 要点の整理
- 最適化ジョブはMarketDataServiceの最新トップ10銘柄を用いるため、データフェッチと計算を強い整合性で連携させたい。
- Temporalワークフロー/アクティビティによる長時間処理とWorkersの短命性を橋渡しする必要がある。
- WASMオプティマイザは計算負荷が高く、キュー制御と結果永続化の整合性が重要。
- 制約セットのバージョニング・監査が求められ、ドメインロジックを明確に分離したい。

### 2.2 パターン候補
1. **Layered (Controller-Service-Repository) + Shared Utilities**
2. **ヘキサゴナルアーキテクチャ + コマンド/クエリハンドラ**
3. **CQRS + Event Sourcing**
4. **Serverless Step Functions (Temporalのみ) オーケストレーション主体**

### 2.3 候補比較
- **Layered**: 実装容易だが、Temporal/WASM/Outboxの依存がサービス層に集中しテスト境界が曖昧。
- **ヘキサゴナル + コマンド/クエリ**: ドメインコアとアダプタを分離でき、Temporal・WASM・DBをポート経由で差し替え可能。TDDと整合しやすい。
- **CQRS + Event Sourcing**: フロンティア履歴追跡に有利だが、イベントストア導入コストが高い。現在の要件では過剰。
- **Temporal主体**: Worker実装をTemporalアクティビティに委譲するとHTTP層とドメインが分断され、APIテストが複雑化。

### 2.4 最終決定
- **採用**: ヘキサゴナルアーキテクチャ + コマンド/クエリハンドラ。
- **理由**: ドメインロジック（制約検証・ジョブ登録）を純粋なコマンドハンドラに集約することで、Temporal／WASM／DB／Queue をポートとして抽象化できる。 TDDで各ハンドラをユニットテストしやすく、OutboxやWorkflowの差し替えが容易。

## 3. 実装計画 (TDD中心)
1. **セットアップ / Tidy First**
   - `packages/portfolio-optimization` 基盤整備、共通ミドルウェア導入。
   - Drizzle schema & migration scaffolding。
   - Temporal/WASMアダプタに対するポートインターフェース設計。
2. **テストドリブンサイクル**
   1. Red: Constraintコマンド（作成/更新）ユニットテスト。
      - Green: Repository + Versioning実装。
      - Refactor: バリデーション共通化。
   2. Red: `POST /jobs` エンドツーエンドテスト（Temporal mock呼び出し）。
      - Green: SubmitJobCommand + API Handler。
      - Refactor: MarketData client mockingファシリティ。
   3. Red: 未許可ロール403テスト。
   4. Red: ジョブ重複409テスト (既にpending)。
   5. Red: `GET /jobs/{id}` 404・completedケース。
   6. Red: `GET /frontiers` フィルタリングテスト。
   7. Red: `GET /frontiers/{id}` 404。
   8. Red: Temporal Workflow完了 -> frontier保存 -> Queue outbox テスト。
   9. Red: WASM Optimizer adapter contractテスト (入力/出力 shape)。
   10. Red: 全エンドポイント401/403共通テスト。
3. **リファクタリング指針**
   - コマンド・クエリ層の共通レスポンスマッパ抽出。
   - Outbox書き込みデコレーターで重複排除。
   - Temporal/WASMインターフェースのエラーマッピング共通化。
4. **品質ゲート**
   - Contractテスト (Prism) で OpenAPI 準拠。
   - Performance Micro-benchmark: WASM最適化 100ms以下/ジョブ（トップ10銘柄）を確認。
   - SQLFluff lint + RLS検証 SQL をCIで実行。

## 4. ユーザー向けタスクリスト
1. **市場データプロバイダ設定**
   - Polygon.io / IEX Cloud の API キーを Vault に登録し、Workers Secrets (`POLYGON_API_KEY`, `IEX_TOKEN`) に同期。
2. **Temporal Cloud 準備**
   - Namespace `indexfrontier-optimization` 作成。Workers用APIキー発行、Secrets (`TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_MTLS_CERT`) 設定。
   - FrontierWorkflowのテンプレート登録（Pyodideランタイムが利用するバンドルをアップロード）。
3. **Neon データベース**
   - `optimization_db` ブランチ作成。RLS有効化、`set app.tenant_id` の初期関数作成。
4. **Cloudflare 設定**
   - Workersに `optimizer-wasm` バイナリをバインド（KV/R2 から取得できるよう配置）。
   - Queue `indexfrontier-frontier-events` 作成し、Insightsサービスにアクセス許可。
5. **CI/CD パイプライン**
   - GitHub Actions 用 API トークン（Cloudflare、Temporal、Neon）をリポジトリシークレットに登録。
   - `UV_LINK_MODE=copy` をCIに設定し、WASMビルドジョブを追加。
6. **監査・セキュリティ**
   - VaultでWASM署名鍵を保管し、署名検証ハッシュをWorkers Secrets (`OPTIMIZER_SIGNATURE`) に設定。
   - Datadog API Key を `DD_API_KEY` として登録、Observability pipelineを有効化。

---
SOW内容の承認後、GitHub Issue（Step 4）作成に進みます。
