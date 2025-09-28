# Notification Orchestrator 実装計画

## 1. 目的
- 分散イベントに基づき多様なチャネルへ通知を配信するオーケストレーション層を TDD/Tidy First で実装する。

## 2. 前提条件
- 他サービスからのイベントスキーマ (UniverseUpdated, MarketRecomputed, PortfolioComputed, ReportReady) が確定済み。
- documents/NotificationOrchestrator_Design.md / NotificationOrchestrator_OpenAPI.yaml を正とする。
- SendGrid、Slack、Webhook など外部チャネルの資格情報が Secrets Manager に登録済み。

## 3. 実装ポリシー
- 冪等性確保: dispatchId により重複通知を防止。
- 再試行戦略: 失敗時は指数バックオフ (1s, 5s, 15s, 45s, 120s)。
- セキュリティ: 外部通知先 URL をホワイトリスト検証、Webhook は署名検証。
- 観測性: すべての通知トランザクションに traceId、eventType、channel を付与。

## 4. タスクリスト (TDD ステップ)
1. **スキーマ整備**
   - Red: Prisma スキーマテストで notification_preferences / dispatch_logs 欠如を検知。
   - Green: Prisma Schema、マイグレーション、RLS ポリシーを実装。
   - Refactor: インデックス最適化。

2. **チャネルアダプタ**
   - Red: Email/Slack/Webhook アダプタの契約テスト (MSW) を追加。
   - Green: 各アダプタ実装、シークレット読み込み。
   - Refactor: 共通基底クラスを抽出。

3. **イベントコンシューマ**
   - Red: UniverseUpdated 等のイベントを受信しディスパッチキューへ投入するテスト。
   - Green: Queue ハンドラ実装、プレファレンス評価。
   - Refactor: イベントマッピング共通化。

4. **POST /notifications/dispatch**
   - Red: RBAC、重複 409、バリデーション 422 テスト。
   - Green: ハンドラ実装、Durable Object でキュー管理。
   - Refactor: リクエスト検証をユーティリティ化。

5. **GET /notifications/dispatch/{dispatchId}**
   - Red: 正常・404・403 テスト。
   - Green: 状態取得実装。
   - Refactor: レスポンス整形共通化。

6. **POST /notifications/preferences**
   - Red: 成功・入力不正・権限違反テスト。
   - Green: 設定更新実装、静的検証。
   - Refactor: Config 暗号化処理を共通化。

7. **再試行・フォールバック**
   - Red: 失敗時のリトライ/フォールバックテスト (メール失敗で Slack 通知等)。
   - Green: リトライ制御、フォールバック戦略実装。
   - Refactor: リトライ設定をコンフィグ化。

8. **監査・メトリクス**
   - Red: notifications_sent_total、failures_total、retry_count のメトリクステスト。
   - Green: ログ・メトリクス実装。
   - Refactor: ログフィールド統一。

## 5. テストと品質確認
- 単体テスト: Vitest。
- 契約テスト: uv run --link-mode=copy prism mock documents/NotificationOrchestrator_OpenAPI.yaml。
- 統合テスト: wrangler dev + Neon Branch、外部チャネルは MSW/Slack モック。
- セキュリティテスト: Webhook 署名検証、URL ホワイトリスト。

## 6. リスクと緩和策
- 外部チャネル障害: フォールバックチャネルへ切替、通知遅延アラート。
- 大量通知: Rate Limit とバッチ処理を導入、Queue 深さ監視。
- 機密情報漏えい: config は暗号化し、ログには含めない。

## 7. 完了条件
- 3 API とイベントディスパッチが設計/契約どおり動作。
- 再試行・フォールバックがテストで証明済み。
- マイクロサービス実装チェックリストの該当項目が完了。
