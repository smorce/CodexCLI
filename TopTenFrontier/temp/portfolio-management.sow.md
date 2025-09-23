# SOW: PortfolioManagementService - Portfolio Lifecycle & Reporting

## 1. タスク概要
ポートフォリオ作成・承認・レポート配信を行う PortfolioManagementService を実装し、Design/OpenAPI/ImplPlan に準拠した API・ワークフロー・レポート生成を完了させる。目的は組織の投資ガバナンスを支える承認フローと監査性を確保すること。

## 2. 設計パターンの検討
### 2.1 要点
- 状態遷移管理が複雑 (DRAFT → PENDING → APPROVED/REJECTED)。
- 承認アクションに伴う監査ログが必須。
- レポート生成は CPU 負荷が高く、非同期化が必要。

### 2.2 候補
1. **状態マシン (State Pattern) + Durable Object レポート生成**
2. **イベントソーシング (承認イベントを逐次保存)**
3. **単純 CRUD + ステータスフィールド更新**
4. **BPMN エンジン連携 (外部ワークフロー SaaS)**

### 2.3 比較
- (1) は実装コストと柔軟性のバランスが良い。状態遷移をコードで明示できる。
- (2) は監査には有効だが、クエリが複雑に。初期段階では過剰。
- (3) は境界チェック不足で不正遷移が発生しやすい。
- (4) は外部依存が増え、Workers との統合が重い。

### 2.4 最終決定
- **採用: (1) 状態マシン + Durable Object レポート生成**。StateMachine ユーティリティで遷移を制御し、承認ログを DB に記録。レポートは Durable Object で非同期実行し、完成時に Pub/Sub 通知。

## 3. 実装計画 (TDD)
1. Prisma スキーマ追加 (構造コミット)。
2. POST /portfolios → GET /portfolios → GET /{id} → PATCH /{id} → POST /approve → POST /publish-report → GET /reports/{id} の順でテスト → 実装。
3. 状態マシンのユニットテスト。
4. Pub/Sub 通知と R2 署名 URL の統合テスト。
5. レポート出力のスナップショットテスト。

## 4. ユーザー向けタスク
- Supabase Auth に nalyst, eviewer ロールを設定。
- Cloudflare Pub/Sub チャネル権限を Next.js フロントエンドに付与。
- レポート用テンプレート (ブランドロゴ、コンプライアンステキスト) を提供。
