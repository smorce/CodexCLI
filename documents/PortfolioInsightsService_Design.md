# Portfolio Insights Service 詳細設計書

## 1. 概要・責務・境界
- Portfolio Optimization Service の結果を受け取り、可視化用指標、レポート、履歴管理、ドキュメント生成を提供するサービス。
- 利用者は API またはフロントエンドを通じて要約や PDF レポートを取得。
- 結果データを Cloudflare R2 に格納し、署名付き URL を発行する。

## 2. API 一覧
| メソッド | パス | 目的 | 認証 | 入力 | 出力 | 代表エラー |
| --- | --- | --- | --- | --- | --- | --- |
| GET | /insights/summary/{portfolioId} | ポートフォリオ要約取得 | 必須 | パス: portfolioId | JSON: summary, metrics | 401, 403, 404, 429, 500 |
| POST | /insights/report | レポート生成ジョブ | 必須 | JSON: { portfolioId, format } | 202 + jobId | 401, 403, 404, 409, 422, 429, 500 |
| GET | /insights/report/{jobId} | レポートジョブ状態/URL | 必須 | パス: jobId | JSON: status, downloadUrl | 401, 403, 404, 429, 500 |

## 3. データモデル & スキーマ
### テーブル: portfolio_summaries
- id (UUID, PK)
- portfolio_id (UUID)
- workspace_id (uuid)
- snapshot_id (UUID, Optimization 結果)
- metrics (jsonb: expectedReturn, risk, sharpe, diversification)
- allocations (jsonb)
- created_at (timestamptz)

### テーブル: report_jobs
- id (UUID)
- portfolio_id (UUID)
- format (text: pdf, html)
- status (enum)
- requested_by (uuid)
- download_url (text)
- created_at, finished_at (timestamptz)
- trace_id (text)

RLS ポリシー
- portfolio_summaries: workspace_id = auth.claims.workspace_id。
- report_jobs: requested_by = auth.uid() またはロールが Admin/PM。

## 4. 連携・依存関係
- Portfolio Optimization Service から PortfolioComputed イベントを受信し、summary を生成。
- Cloudflare R2 へレポートファイルを保存。
- Notification Orchestrator へ完了通知を送信。
- Supabase Auth JWT で RBAC を評価。

## 5. セキュリティ・認可・レート制限・入力検証
- 認証: Supabase JWT。
- 認可: Viewer 以上が summary 参照可、Analyst 以上がレポート生成可。
- レート制限: summary 取得 120 req/分/ユーザー、report 作成 20 req/時/ワークスペース。
- 入力検証: format は pdf または html、portfolioId は UUID。
- データ保護: レポートファイルは R2 で SSE-KMS 暗号化し、署名付き URL 有効期限は 1 時間。

## 6. エラーハンドリング方針
- 401/403: 認証・認可違反。
- 404: portfolioId または jobId 不明。
- 409: 同一 portfolioId のレポートが進行中。
- 422: 入力フォーマット不正。
- 429: レート制限。
- 500: レポート生成失敗、R2 障害。
- エラー形式: { code, message, traceId }

## 7. 技術詳細
- ランタイム: TypeScript + Hono。
- テンプレート: MDX → PDF 変換 (Next.js Image + Cloudflare Workers) または HTML。
- レンダリング: Puppeteer for Workers (Chromium WASM) を利用。
- ストレージ: Cloudflare R2 + Metadata (content-type)。
- イベント: Cloudflare Queues で report ジョブを処理。
- 観測性: レポート生成時間、ファイルサイズ、失敗率をメトリクス化。
- テスト: Vitest (API)、Playwright (レンダリング)、契約テスト (Prism)。
