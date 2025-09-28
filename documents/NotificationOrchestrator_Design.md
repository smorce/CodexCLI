# Notification Orchestrator 詳細設計書

## 1. 概要・責務・境界
- Universe, Market Data, Optimization, Insights のイベントを受け取り、メール・Webhook・Slack などの通知チャネルへ配信する。
- 冪等性と再試行を管理し、通知失敗時のフォールバックを実装。
- 個別設定 (チャネル、quiet hours) をワークスペース単位で保持。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| POST | /notifications/dispatch | 手動通知トリガー | 必須 (Admin/PM) | JSON: eventType, targets | 202 + dispatchId | 401, 403, 404, 409, 422, 429, 500 |
| GET | /notifications/dispatch/{dispatchId} | 通知状態取得 | 必須 | パス: dispatchId | JSON: status, attempts | 401, 403, 404, 429, 500 |
| POST | /notifications/preferences | 通知設定更新 | 必須 | JSON: channel, enabled, config | JSON: preference | 401, 403, 404, 422, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: notification_preferences
- id (UUID, PK)
- workspace_id (uuid)
- channel (text: email, webhook, slack)
- enabled (boolean)
- config (jsonb)
- quiet_hours (jsonb)
- updated_at (timestamptz)
- unique(workspace_id, channel)

### テーブル: dispatch_logs
- id (UUID, PK)
- workspace_id (uuid)
- event_type (text)
- status (enum: QUEUED, DELIVERING, SUCCEEDED, FAILED)
- attempts (int)
- payload (jsonb)
- error (jsonb)
- created_at, updated_at (timestamptz)
- trace_id (text)

RLS ポリシー
- notification_preferences: workspace_id = auth.claims.workspace_id。
- dispatch_logs: workspace_id 一致かつロールが Admin/PM の場合に閲覧可。

## 4. 連携・依存関係
- Cloudflare Queues でイベントを受信。
- SendGrid (メール)、Slack API、Webhook URL など外部通知先。
- User Collaboration Service のメンバー情報を参照。
- Datadog へ通知失敗メトリクス送信。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT。
- 認可: 通知設定更新および手動ディスパッチは Admin/PM のみ。
- レート制限: 手動ディスパッチ 30 req/時/ワークスペース。
- 入力検証: channel 値検証、Webhook URL は HTTPS 限定、quiet hours フォーマット検証。
- 機密情報: API キーは Secrets Manager で管理、config にはトークンを暗号化して保存。

## 6. エラーハンドリング方針
- 401/403: 認証・認可失敗。
- 404: dispatchId または設定未登録。
- 409: 同一イベントの重複ディスパッチ。
- 422: 入力不正。
- 429: レート制限。
- 500: 外部通知サービス障害。
- エラー形式: { code, message, traceId, retryable }

## 7. 技術詳細
- ランタイム: TypeScript + Hono。
- ジョブ管理: Durable Object + Cloudflare Queues。
- 冪等性: dispatchId をキーに再送制御、最大 5 回リトライ (指数バックオフ)。
- チャネルアダプタ: EmailAdapter, SlackAdapter, WebhookAdapter を Strategy Pattern で実装。
- 観測性: notifications_sent_total, notification_failures_total, retry_count ヒストグラム。
- テスト: Vitest (ユニット)、MSW (外部 API モック)、契約テスト (Prism)。
