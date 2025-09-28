# User Collaboration Service 実装計画

## 1. 目的
- ワークスペース管理・コメント機能を TDD/Tidy First で実装し、投資チームの共同作業基盤を整える。

## 2. 前提条件
- Supabase Auth が稼働し、ロール情報 (role, workspace_id) を JWT に含んでいる。
- documents/UserCollaborationService_Design.md / UserCollaborationService_OpenAPI.yaml を正とする。

## 3. 実装ポリシー
- RBAC をミドルウェア層で実装し、各ハンドラで最小権限を確認。
- コメント本文はサニタイズ (DOMPurify for Workers)。
- 監査ログは全アクションで記録し、Datadog へ送信。
- 変更系 API は idempotent (同一 payload は同結果) を目指す。

## 4. タスクリスト (TDD ステップ)
1. **スキーマ整備**
   - Red: Prisma スキーマテストで workspaces, workspace_members, comments 欠如を検知。
   - Green: Prisma Schema、マイグレーション、RLS ポリシーを追加。
   - Refactor: Foreign key とインデックスの命名整理。

2. **RBAC ミドルウェア**
   - Red: ロール判定テスト (ADMIN/PM/ANALYST/VIEWER) を追加。
   - Green: ミドルウェア実装、Supabase JWT 検証。
   - Refactor: ロール定義を列挙型に統一。

3. **POST /workspaces**
   - Red: 成功、重複 409、バリデーション 422 のテスト。
   - Green: ハンドラ実装、所有者設定、監査ログ。
   - Refactor: レスポンス変換を共通化。

4. **GET /workspaces/{workspaceId}**
   - Red: 成功、権限不足 403、404 テスト。
   - Green: ハンドラ実装、キャッシュ。
   - Refactor: DTO 共通化。

5. **POST /workspaces/{workspaceId}/members**
   - Red: 追加/更新シナリオテスト、権限検証。
   - Green: メンバー管理ハンドラ、通知イベント送信。
   - Refactor: メンバー操作ロジック抽出。

6. **POST /workspaces/{workspaceId}/comments**
   - Red: 正常、XSS サニタイズ検証、バリデーション 422 テスト。
   - Green: コメント保存、Notification Orchestrator 通知。
   - Refactor: コメント整形共通化。

7. **監査・メトリクス**
   - Red: ログ出力と metrics (workspace_requests_total) のテスト。
   - Green: ロガーとメトリクス導入。
   - Refactor: ログフィールド命名調整。

## 5. テストと品質確認
- 単体テスト: Vitest。
- 契約テスト: uv run --link-mode=copy prism mock documents/UserCollaborationService_OpenAPI.yaml。
- 統合テスト: wrangler dev + Neon Branch。
- セキュリティテスト: コメントサニタイズの XSS テスト。

## 6. リスクと緩和策
- ロール整合性不備: Supabase 側でロール変更 webhook を受け取り、キャッシュ無効化。
- コメントスパム: レート制限 + Bot 検知を導入。
- 監査ログ欠落: ログ送信失敗時に再試行とローカルバッファ。

## 7. 完了条件
- 4 つの API が設計・OpenAPI 契約通りに動作。
- 監査ログとメトリクスが出力される。
- マイクロサービス実装チェックリスト該当項目が完了。
