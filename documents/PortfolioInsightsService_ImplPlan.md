# Portfolio Insights Service 実装計画

## 1. 目的
- 最適化結果の要約・レポート生成 API を TDD で実装し、投資家が迅速に分析できる洞察を提供する。

## 2. 前提条件
- Portfolio Optimization Service が PortfolioComputed イベントを発行。
- documents/PortfolioInsightsService_Design.md / PortfolioInsightsService_OpenAPI.yaml を正とする。
- Cloudflare R2 バケットおよびアクセスキーが設定済み。

## 3. 実装ポリシー
- TDD: API ごとに Red → Green → Refactor。
- Tidy First: テンプレート整備やディレクトリ構成変更は事前に実施。
- RBAC: Supabase JWT からロール判定、Viewer は閲覧のみ。
- レポート生成は idempotent にし、ジョブ重複を回避。

## 4. タスクリスト (TDD ステップ)
1. **スキーマ整備**
   - Red: Prisma スキーマテストで portfolio_summaries / report_jobs 欠如を検出。
   - Green: Prisma Schema とマイグレーション、RLS ポリシーを実装。
   - Refactor: インデックスとデフォルト値調整。

2. **イベントインジェスト**
   - Red: PortfolioComputed イベントを受信し summary を保存するテスト。
   - Green: Queue コンシューマ実装、metrics 算出。
   - Refactor: データマッパー共通化。

3. **GET /insights/summary/{portfolioId}**
   - Red: 正常、403、404、429 テスト。OpenAPI 契約検証。
   - Green: ルータ実装、Prisma クエリ、キャッシュ。
   - Refactor: レスポンスフォーマッタ抽出。

4. **POST /insights/report**
   - Red: RBAC, 409 競合、422 検証テスト。
   - Green: Durable Object でレポートジョブ管理、Queue へのジョブ投入。
   - Refactor: 入力検証ロジック共通化。

5. **レポートレンダラー**
   - Red: Puppeteer for Workers をモックし、PDF/HTML 生成をテスト。
   - Green: レンダリング実装、R2 へのアップロード、署名付き URL 生成。
   - Refactor: テンプレート管理をモジュール化。

6. **GET /insights/report/{jobId}**
   - Red: 成功・404・403 ケーステスト、traceId 伝播を検証。
   - Green: ジョブ状態取得と URL 返却実装。
   - Refactor: エラーレスポンスを共通化。

7. **監査・メトリクス**
   - Red: レポート生成時間、ファイルサイズ記録のテスト。
   - Green: 構造化ログとメトリクス導入。
   - Refactor: Log フォーマット統一。

## 5. テストと品質確認
- 単体テスト: Vitest。
- レンダリング検証: Playwright on Workers (screenshot compare)。
- 契約テスト: uv run --link-mode=copy prism mock documents/PortfolioInsightsService_OpenAPI.yaml。
- 統合テスト: wrangler dev + Neon Branch + R2 スタブ。

## 6. リスクと緩和策
- PDF 生成失敗: リトライとフォールバックで HTML を提供。
- 大容量レポート: ファイルサイズ上限 20MB を超えた場合は圧縮。
- セキュリティ: 署名付き URL の権限漏洩を防ぐため scope 限定。

## 7. 完了条件
- 3 API とレンダリングワーカーが設計/契約どおり動作。
- テスト・リント・レンダリング検証が完了。
- マイクロサービス実装チェックリストの該当項目を満たす。
