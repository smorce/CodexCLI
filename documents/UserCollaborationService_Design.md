# User Collaboration Service 詳細設計書

## 1. 概要・責務・境界
- ワークスペース、メンバー管理、コメント、アクティビティログを提供し、投資チームのコラボレーションを支援する。
- Supabase Auth からのユーザー情報をベースに RBAC を適用し、監査証跡を保持する。
- 他サービスへの直接依存は最小化し、イベントによる通知を中心に連携する。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| POST | /workspaces | 新規ワークスペース作成 | 必須 | JSON: name, description | JSON: workspace | 401, 403, 409, 422, 429, 500 |
| GET | /workspaces/{workspaceId} | ワークスペース詳細取得 | 必須 | パス: workspaceId | JSON: workspace | 401, 403, 404, 429, 500 |
| POST | /workspaces/{workspaceId}/members | メンバー招待/ロール更新 | 必須 | JSON: userId, role | JSON: membership | 401, 403, 404, 409, 422, 429, 500 |
| POST | /workspaces/{workspaceId}/comments | コメント投稿 | 必須 | JSON: portfolioId, body | JSON: comment | 401, 403, 404, 422, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: workspaces
- id (UUID, PK)
- name (text unique per org)
- description (text)
- owner_id (uuid)
- created_at, updated_at

### テーブル: workspace_members
- id (UUID, PK)
- workspace_id (UUID FK)
- user_id (uuid)
- role (text: ADMIN, PORTFOLIO_MANAGER, ANALYST, VIEWER)
- invited_at, joined_at
- unique(workspace_id, user_id)

### テーブル: comments
- id (UUID, PK)
- workspace_id (UUID)
- portfolio_id (UUID)
- user_id (uuid)
- body (text, markdown)
- created_at
- trace_id (text)

RLS ポリシー
- workspaces: owner_id = auth.uid() またはメンバーのみ。
- workspace_members: workspace_id がユーザー所属のもののみ。
- comments: workspace_id に所属するユーザーのみ参照・追加。

## 4. 連携・依存関係
- Supabase Auth でユーザー情報・ロール管理。
- Portfolio Insights Service から portfolioId を受け参照整合性を保つ (foreign data wrapper)。
- Notification Orchestrator にコメント通知イベントを送信。
- Audit ログを Datadog へ送信。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT。
- 認可: ワークスペース操作はロールベース (ADMIN: 全権, PORTFOLIO_MANAGER: メンバー管理, ANALYST: コメント投稿, VIEWER: 読み取りのみ)。
- レート制限: ワークスペース作成 10/日/ユーザー、コメント投稿 120/分/ワークスペース。
- 入力検証: コメント body は 4KB 以内、Markdown 許容タグのみ (DOMPurify)。
- 監査ログ: すべての変更操作を記録。

## 6. エラーハンドリング方針
- 401/403: 認証・認可失敗。
- 404: workspaceId, comment 対象が存在しない。
- 409: 既存メンバー登録済み。
- 422: 入力バリデーション失敗。
- 429: レート制限。
- 500: DB エラー、外部連携失敗。
- エラー形式: { code, message, traceId }

## 7. 技術詳細
- ランタイム: TypeScript + Hono。
- データベース: Neon PostgreSQL、RLS ポリシーと CHECK 制約 (role 制約)。
- キャッシュ: ワークスペース一覧を 5 分キャッシュ。
- 監査: Cloudflare Workers から Datadog に JSON ログを送信。
- 可観測性: workspace_requests_total, membership_changes_total メトリクス。
- テスト: Vitest (API)、Contract Test (Prism)、Integration (wrangler dev + Neon)。
