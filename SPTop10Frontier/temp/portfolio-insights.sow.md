# SOW: Portfolio Insights Service

## 1. タスク概要
- 目的: 最適化結果の要約 API とレポート生成ワークフローを実装し、投資家向けドキュメントを提供する。
- ゴール: Summary/Report API とイベントドリブンなレポート生成ジョブを TDD で完成させる。

## 2. 設計パターンの検討
### 2.1 要点
- PortfolioComputed イベント処理とデータ整形。
- レポート生成 (PDF/HTML) の非同期処理と再試行。
- 署名付き URL による安全な配布。

### 2.2 候補
1. **イベントドリブン + Queue ベースのレンダリング (推奨)**
2. **同期レポート生成 (API 内で完結)**
3. **外部レポート SaaS 連携**
4. **Lambda スタイルのオンデマンドレンダリング**

### 2.3 比較
- Queue ベース: ワーカー負荷分散・再試行が容易。設計書の Durable Object/Queue 方針と一致。
- 同期生成: レスポンス遅延が大きく SLA 達成困難。
- SaaS 連携: 柔軟だがコスト・依存度が高い。
- Lambda 型: Cloudflare Workers との親和性は低い。

### 2.4 最終決定
- **採用**: Queue + Worker レンダリング。
- **理由**: 再試行と遅延制御が容易で、R2 への保存と署名付き URL 発行にも適合。

## 3. 実装計画 (TDD)
1. Prisma スキーマ/マイグレーション。
2. PortfolioComputed イベントコンシューマ → テスト → 実装。
3. GET /insights/summary/{id} → テスト → 実装。
4. POST /insights/report → テスト → 実装。
5. レポートレンダラー (Puppeteer WASM) → テスト → 実装。
6. GET /insights/report/{jobId} → テスト → 実装。
7. 観測性・通知 → テスト → 実装。

## 4. ユーザー向けタスクリスト
- Cloudflare R2 バケット作成とアクセスキー登録。
- Puppeteer for Workers のライセンス確認とビルドキャッシュ準備。
- Report テンプレート (MDX) の初期スケルトン提供。
- Notification Orchestrator の Slack/Webhook URL 定義。

## 5. 合意事項
- 本 SOW 承認後に Portfolio Insights Service 実装を開始。
