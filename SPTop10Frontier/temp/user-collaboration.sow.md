# SOW: User Collaboration Service

## 1. タスク概要
- 目的: ワークスペース管理、メンバー招待、コメント投稿 API を実装し、チームコラボレーションを可能にする。
- ゴール: 4 API と RBAC/監査基盤を TDD で整備し、設計書・OpenAPI と一致させる。

## 2. 設計パターンの検討
### 2.1 要点
- Supabase Auth との RBAC 連携。
- コメントサニタイズと監査ログ。
- 冪等なメンバー操作。
- 通知サービスとの連携。

### 2.2 候補
1. **ミドルウェア型 RBAC + Repository パターン**
2. **Policy Enforcement Point (PEP) サービス分離**
3. **GraphQL Gateway 経由で一元管理**
4. **直接 DB アクセス簡易実装**

### 2.3 比較
- ミドルウェア型 RBAC: 実装がシンプルで Hono と親和性高。
- PEP サービス: セキュリティ強固だが過剰な分散。
- GraphQL Gateway: 柔軟だがガバナンス複雑。
- 直接 DB: 再利用性が低く監査ログ統合が難しい。

### 2.4 最終決定
- **採用**: ミドルウェア型 RBAC + Repository パターン。
- **理由**: 設計書の要件を満たしつつシンプルに RBAC/監査を実現できる。

## 3. 実装計画 (TDD)
1. Prisma スキーマ/マイグレーション。
2. RBAC ミドルウェア (ロールテスト) → 実装。
3. POST /workspaces → テスト → 実装。
4. GET /workspaces/{id} → テスト → 実装。
5. POST /workspaces/{id}/members → テスト → 実装。
6. POST /workspaces/{id}/comments → テスト → 実装。
7. 監査ログ・通知連携 → テスト → 実装。

## 4. ユーザー向けタスクリスト
- Supabase Auth でロールクレーム (role, workspace_id) を JWT に含める設定。
- Datadog へのログ送信用 API Key 登録。
- コメントモデレーションポリシーの提示 (禁止ワードなど)。
- Notification Orchestrator の Slack/Webhook 設定。

## 5. 合意事項
- 本 SOW 承認後に User Collaboration Service 実装を開始。
