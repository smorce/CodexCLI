# Universe Ingestion Service 実装計画

## 1. 目的
- Universe Ingestion Service の API とバッチ処理を TDD で安全に実装し、最新トップ 10 銘柄データを提供する。
- 設計書および OpenAPI 契約を厳格に遵守し、Supabase Auth に基づく RBAC と RLS を徹底する。

## 2. 前提条件
- documents/SPTop10Frontier_Architecture.md を理解済み。
- documents/UniverseIngestionService_Design.md / UniverseIngestionService_OpenAPI.yaml を正とする。
- Prisma スキーマに universe_snapshots / universe_events テーブルが未定義であることを確認。
- IEX Cloud API キーは Secrets Manager に格納済み (環境変数 IEX_API_KEY)。

## 3. 実装ポリシー
- TDD: Red → Green → Refactor を 1 機能単位で遵守。
- Tidy First: スキーマ追加やフォルダ構成調整など構造的変更は専用コミットに分離。
- OpenAPI 契約: Prism または Dredd を用いて契約検証を自動化し、差異が出た場合は即修正。
- 観測性: traceparent の伝播と構造化ログ (level, traceId, event) を各ハンドラで出力。

## 4. タスクリスト (TDD ステップ)
1. **データモデル基盤**
   - Red: Prisma スキーマ検証テストを追加し、新テーブル構造と RLS ポリシーが欠如していることを明示。
   - Green: Prisma Schema 更新とマイグレーション、RLS Policy SQL を実装。
   - Refactor: 命名やコメントを整備。

2. **GET /universe/top10**
   - Red: 最新 snapshot を返すユニットテストと OpenAPI 契約テストを追加。
   - Green: ルータ実装、Prisma クエリ、KV キャッシュ、構造化ログを実装。
   - Refactor: 共通レスポンス組み立てをユーティリティ化。

3. **POST /universe/sync**
   - Red: RBAC テスト (Admin/Portfolio Manager のみ成功)、ジョブ競合 409 テスト、Queue へのメッセージ投入テスト。
   - Green: Durable Object でロック管理、Queue 発行、202 応答を実装。
   - Refactor: Durable Object 状態管理ロジックを共通化。

4. **GET /universe/sync/{syncJobId}**
   - Red: ジョブ状態確認テスト、404 と 403 ケース、traceId 伝播検証。
   - Green: Durable Object から状態読み取り実装。
   - Refactor: エラーマッピングを共通テーブル化。

5. **バッチ同期ワーカー**
   - Red: Cron トリガーから IEX API 呼び出し→ snapshot 保存→ UniverseUpdated イベント送出を検証する統合テスト (MSW モック)。
   - Green: ワーカースクリプト実装 (再試行、Circuit Breaker、チェックサム生成)。
   - Refactor: HTTP クライアントの共通化と設定抽出。

6. **通知イベント**
   - Red: UniverseUpdated イベントが Market Data Service キューに送信されるテストを追加。
   - Green: Queue 発行ロジックで traceId と snapshot ハッシュを付与。
   - Refactor: イベントペイロードスキーマを専用モジュールに抽出。

7. **監査・監視**
   - Red: 構造化ログとメトリクス出力のテスト (ログスナップショット + メトリクス検証) を追加。
   - Green: Logger 実装、メトリクス (requests_total, sync_duration_seconds) を追加。
   - Refactor: メトリクス命名規則を整理。

## 5. テストと品質確認
- 単体テスト: Vitest + MSW。
- 契約テスト: uv run --link-mode=copy prism mock documents/UniverseIngestionService_OpenAPI.yaml でスキーマ検証。
- 集約テスト: Cloudflare Workers ローカルランナー (wrangler dev) で統合テスト。
- チェックリスト: documents/UniverseIngestionService_Design.md のセキュリティ要件とマイクロサービス実装チェックリストを全て満たすこと。

## 6. リスクと緩和策
- 外部 API 障害: Circuit Breaker + 最新成功 snapshot をフォールバックとして返却。
- データ整合性: checksum で差分検知、失敗時は前回 snapshot のまま維持。
- レート制限: IEX API 呼び出し間隔を 500ms 以上に設定、失敗時は指数バックオフ。

## 7. 完了条件
- 3 つの API と Cron ワーカーが OpenAPI 契約および設計書どおりに動作。
- すべてのテストおよびリントがパスし、Observability メトリクスがエクスポートされている。
- マイクロサービス実装チェックリストの該当項目がすべて完了。
