# SOW: Notification Orchestrator

## 1. タスク概要
- 目的: マイクロサービスイベントを多様な通知チャネルへ配信するオーケストレータを実装する。
- ゴール: Dispatch/Status/Preferences API とイベントディスパッチパイプラインを TDD で完成させる。

## 2. 設計パターンの検討
### 2.1 要点
- 再試行とフォールバック戦略。
- チャネルごとの設定とセキュリティ。
- イベント→通知 mapping の拡張性。

### 2.2 候補
1. **Strategy Pattern によるチャネルアダプタ + Durable Object キュー**
2. **外部通知プラットフォーム (PagerDuty, OpsGenie) 連携**
3. **Pub/Sub (Kafka 等) + Worker**
4. **同期 API 呼び出しのみ**

### 2.3 比較
- Strategy + Durable Object: 設計書と整合し、再試行・冪等性を制御しやすい。
- 外部プラットフォーム: 信頼性は高いがコストと依存度増。
- Pub/Sub: 強力だがインフラ追加が必要。
- 同期呼び出し: レイテンシ・失敗時の再試行が困難。

### 2.4 最終決定
- **採用**: Strategy Pattern + Durable Object + Queue。
- **理由**: 柔軟なチャネル追加と再試行制御を両立し、Cloudflare 基盤内で完結できる。

## 3. 実装計画 (TDD)
1. Prisma スキーマ/マイグレーション。
2. チャネルアダプタテスト → 実装。
3. イベントコンシューマテスト → 実装。
4. POST /notifications/dispatch → テスト → 実装。
5. GET /notifications/dispatch/{id} → テスト → 実装。
6. POST /notifications/preferences → テスト → 実装。
7. 再試行・フォールバック・観測性 → テスト → 実装。

## 4. ユーザー向けタスクリスト
- SendGrid、Slack、Webhook 用クレデンシャルを Secrets に登録。
- Webhook 先ドメインのホワイトリスト一覧を提供。
- Quiet hours ポリシーを決定し、設定値を共有。
- Datadog と PagerDuty 連携設定を準備。

## 5. 合意事項
- 本 SOW 承認後に Notification Orchestrator 実装を開始。
