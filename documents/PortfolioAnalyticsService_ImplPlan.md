# PortfolioAnalytics Service 実装計画書

## 0. 前提
- documents/SPTop10Frontier_Architecture.md と documents/PortfolioAnalyticsService_Design.md, documents/PortfolioAnalyticsService_OpenAPI.yaml を正とする。
- 実装は Cloudflare Workers (TypeScript) + Rust モジュール構成を前提。Neon には Prisma Client Edge を利用。
- すべての作業は TDD (Red→Green→Refactor) と Tidy First を遵守。

## 1. 準備 (Tidy First)
1. lint/format/テストのベース設定を確認 (ESLint, Prettier, Vitest)。不足があれば構造変更として整備。
2. プロジェクトに analytics サービス用ディレクトリ (例: workers/portfolio-analytics) と共有ユーティリティ (packages/domain-analytics) を追加。
3. OpenAPI 仕様をもとに API Contract テストスケルトンを生成 (openapi-zod-client 等)。
4. Neon 接続向け環境変数キーを整理し .env.example を更新 (秘密情報は追加しない)。

## 2. TDD フェーズ詳細
### フェーズA: 入力検証とルーティング
1. Red: POST /analytics/frontier のバリデーションテスト (lookbackDays 境界、constraints 構造) を Vitest で作成。
2. Green: Zod スキーマとバリデーションロジックを実装し、422 応答を返す。
3. Refactor: スキーマを packages/domain-analytics/schemas.ts に抽出して共有。
4. 同様に POST /analytics/optimization のテスト/実装を行い objectiveType ごとの必須項目を検証。

### フェーズB: ジョブ永続化とレスポンス
1. Red: ジョブ作成時に Neon にレコードが挿入されることを確認するリポジトリテストを作成 (Supabase セッション変数付き接続をモック)。
2. Green: Prisma Client Edge で analytics_jobs テーブルへの insert 処理を実装し trace_id を生成。
3. Refactor: リポジトリ層とサービス層を分離し DTO を導入。
4. Red: POST /analytics/frontier 応答が JobSubmissionResponse と一致する契約テストを追加。
5. Green: ハンドラーでリポジトリ結果を整形し 202 応答を返却。

### フェーズC: 外部サービス統合 (Index/Market)
1. Red: MarketData と IndexConstituent API 呼び出しをモックし、正しい URL とヘッダーで呼び出されることを検証。
2. Green: Fetch ラッパーを実装し、ETag キャッシュと指数バックオフリトライを追加。
3. Refactor: HTTP クライアントを packages/shared-http に抽出し再利用。

### フェーズD: 計算エンジン (Rust + WASM)
1. Red: Rust 単体テストで QP ソルバーが制約を満たすか確認 (簡易データセット)。
2. Green: mean_variance.rs を実装し対数収益率から平均ベクトルと共分散行列を算出、Newey-West 補正と制約適用を実装。
3. Refactor: FFI インターフェースを整理し TypeScript から呼び出しやすい DTO に変換。
4. Red: Worker から Rust モジュールを呼び出す統合テスト (10 銘柄×10日) を追加。
5. Green: WASM ビルドと Worker バインディングを設定。

### フェーズE: ジョブ実行と状態遷移
1. Red: Durable Object ベースのジョブキューで enqueueJob を呼び出し pending→running→succeeded 状態が遷移するシナリオテスト。
2. Green: Durable Object 実装と Cloudflare Queues へのイベント発行を実装。失敗時は status=failed に更新し error_payload を保存。
3. Refactor: 状態列挙を JobStatus enum に統一しロガーを構造化 JSON に整備。
4. Red: GET /analytics/jobs/{jobId} がステータスと frontier/result を返す契約テスト。
5. Green: リポジトリで frontier_points と optimization_solutions を JOIN し 409 条件をカバー。

### フェーズF: 制約テンプレートと RLS 確認
1. Red: GET /analytics/constraints テストでテンプレート配列が返ること、RLS により別組織の制約が見えないことを確認。
2. Green: Neon からテンプレートを取得しレスポンス生成、または静的 JSON の場合はキャッシュを実装。
3. Refactor: キャッシュ層を導入し頻繁なアクセスを KV に 5 分保持。

## 3. 観測性とレジリエンス対応
- OpenTelemetry ミドルウェアを Worker に追加し traceparent を継承。
- Cloudflare Queues Dead Letter を監視し Supabase Functions で再実行ワークフローを実装。
- calcTimeMs, jobSuccessRate, queueDepth をメトリクスとして Prometheus 形式でエクスポート。
- 失敗時の通知イベント analytics.job.failed を Notification Service に連携。

## 4. ドキュメントとハンドオフ
- README を更新し、環境変数、コマンド、追加したテストの実行方法を記載。
- OpenAPI から API リファレンスを再生成し Next.js BFF と同期。
- SLO: フロンティア 50 ポイント生成を 1 秒以内、成功率 99% を目標にダッシュボードへ登録。

## 5. リスクとフォローアップ
- 市場データ API の仕様変更に備え、アダプターレイヤーへフェイルオーバーエンドポイントを準備。
- Rust WASM ビルド時間の増大に備え CI キャッシュ (sccache) を設定。
- 将来の多銘柄対応 (Top 20) を想定し、アルゴリズム部分を汎用 N 銘柄構造で実装。
- Notification Service 連携と Stripe メータリングは別イテレーションで拡張。
