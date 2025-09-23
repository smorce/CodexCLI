# PortfolioManagementService Implementation Plan

## 1. 概要
- 目的: ポートフォリオ作成・承認・レポート API を実装し、Design/OpenAPI と整合させる。
- 範囲: REST ハンドラ、Prisma モデル、R2 レポート生成キュー、Pub/Sub 通知、監査ログ。

## 2. セットアップ
- Prisma schema に portfolio テーブル群を追加 (別コミット)。
- Cloudflare Pub/Sub チャネル portfolio-status をプロビジョニング。
- Report 生成用 Durable Object + PDF テンプレート (Handlebars) を作成。

## 3. テスト戦略
- ユニット: 入力検証、状態遷移、RLS enforcement。
- 統合: Supabase emulator + Prisma、OptimizationService モック、Pub/Sub テスト。
- スナップショット: レポート JSON テンプレート -> PDF/CSV 出力を Golden ファイルで比較。
- OpenAPI 契約: Schemathesis でバリデーション。

## 4. 実装手順
### 4.1 Tidy First
- 共通状態遷移ユーティリティ (enum machine) を抽出し、単体テスト追加。
- Prisma ネーミング規約を共通化 (snake_case)。

### 4.2 エンドポイント別 TDD
1. POST /portfolios
   - Red: 必須フィールド欠落で 422、権限不足で 403。
   - Green: Prisma insert + OptimizationService からの初期ウェイト取り込み。
   - Refactor: DTO 変換共通化。
2. GET /portfolios
   - Red: フィルタ/ページングテスト。
   - Green: Prisma クエリ + cursor pagination。
   - Refactor: PortfolioSummary マッパー抽出。
3. GET /portfolios/{id}
   - Red: 他 org のアクセスで 403。
   - Green: Prisma join + allocations/logs。
   - Refactor: response serializer 分離。
4. PATCH /portfolios/{id}
   - Red: status != DRAFT で 409。
   - Green: 更新処理。
   - Refactor: バリデーション共通化。
5. POST /portfolios/{id}/approve
   - Red: 状態遷移違反/権限不足テスト。
   - Green: 状態マシン・ログ記録・Pub/Sub 通知。
   - Refactor: Pub/Sub ユーティリティ抽出。
6. POST /portfolios/{id}/publish-report & GET /reports/{id}
   - Red: レポート未準備で 409、権限検証。
   - Green: Durable Object ジョブ + R2 署名付き URL。
   - Refactor: レポート生成テンプレートキャッシュ。

### 4.3 イベント取り込み
- Queue optimization.completed 購読ロジック。
  - Red: 未マッピングジョブID で no-op。
  - Green: ポートフォリオに結果を紐付け、通知。
  - Refactor: リトライ/デッドレター。

## 5. データ移行
- 既存組織向けテンプレートポートフォリオの seed を別 Issue で管理。

## 6. 完了条件
- OpenAPI 契約テスト合格、Pub/Sub 通知が Next.js モックに届く。
- レポート生成が PDF/CSV で成功し、R2 署名 URL を返却。
- 監査ログが BigQuery に送出される。
