# IndexConstituentService Implementation Plan

## 1. 概要
- 目的: S&P 500 上位 10 銘柄の同期と履歴管理 API を Cloudflare Workers 上に実装。
- 範囲: Design/OpenAPI に定義された REST エンドポイント、Durable Object ベースの同期ジョブ、Cloudflare Queue 発行、Neon への永続化。
- 非範囲: MarketDataService へのデータ取得、UI 実装、外部 API モジュールの本番キー設定。

## 2. 前提条件 / セットアップ
- Supabase Auth JWT をローカルテストで検証するため Supabase emulator を起動。
- Prisma Schema (schema.prisma) に index_constituent schema を追加。マイグレーションは別コミット。
- Cloudflare Workers プロジェクトで Hono ルーター、OpenAPI validator、中間層 (JWT 検証, RLS context inject) を既存共通ライブラリとして利用。

## 3. テスト戦略 (TDD)
1. ユニットテスト: Handler レベルで JSON Schema validation、RLS コンテキスト組み立て、Durable Object のステート遷移をテスト。
2. 統合テスト: Prisma + Neon test branch (shadow DB) を用いて GET 系のクエリ結果と RLS ポリシーを検証。
3. 外部 API モック: WireMock (uv run --link-mode=copy) で Polygon.io への HTTP リクエストを再現。
4. Queue 検証: Cloudflare Queues emulator でイベント payload を assert。
5. OpenAPI 契約: Dredd または Schemathesis で OpenAPI ドリブンテスト。

## 4. 実装手順 (Tidy First + TDD)
### 4.1 Tidy First
- 既存共通ライブラリに OrgContext 型が欠ける場合は追加 (別コミットで構造変更のみ)。
- Prisma schema に service schema を追加し、マイグレーションファイルを生成。ただしデータ挿入は後続 Red フェーズで行う。

### 4.2 エンドポイント別 TDD サイクル
1. GET /v1/constituents/top10
   - Red: 期待レスポンス構造とキャッシュヘッダー (ETag, Cache-Control) を確認するテスト。
   - Green: Prisma クエリと DTO 変換を実装。キャッシュ層 (KV) は最小実装。
   - Refactor: DTO マッパー共通化、メトリクスラッパ抽出。
2. GET /v1/constituents/history
   - Red: ページング・カーソルの境界条件テスト (limit=100, cursor 不存在)。
   - Green: SQL クエリ + 
extCursor 計算。
   - Refactor: カーソル生成をユーティリティに抽出。
3. GET /v1/constituents/changes
   - Red: since 未指定時の 422、	ype フィルタの挙動テスト。
   - Green: Query 実装 + Queue payload 互換性。
   - Refactor: ChangeEvent 型と Queue publisher を共通モジュール化。
4. POST /v1/constituents/sync
   - Red: 管理者ロール以外 403、ジョブ重複時 409。
   - Green: Durable Object ロジック + 外部 API 呼び出し (モック) 実装。
   - Refactor: リトライポリシー・バックオフを構成化。
5. GET /v1/constituents/providers/status
   - Red: Provider 記録が無い場合 200 + 空配列、異常状態のレスポンス。
   - Green: Prisma クエリ -> DTO。
   - Refactor: ステータス整形 + ヘルスチェックメトリクス共通化。

### 4.3 イベント発行
- Red: Queue への publish が期待 payload を保証するテスト。
- Green: ChangeEvent 生成を同期ジョブ完了時に実装。
- Refactor: イベント用型を TypeScript zod スキーマと同期。

## 5. 移行 & データ初期化
- 初回同期用に seed スクリプトを別 Issue で扱う。ここではマイグレーションのみ。
- provider_status に初期レコードを挿入する SQL を提供 (手作業 or スクリプト)。

## 6. パフォーマンス / 信頼性検証
- k6 を用いた /top10 負荷テスト (p95 < 200ms) を CI で閾値チェック。
- Chaos テスト: 外部 API 429 応答時のバックオフをテスト。

## 7. 完了条件
- 全 API が OpenAPI 契約テストをパス。
- Queue イベントが MarketDataService 契約に一致。
- Prisma マイグレーションが適用され、RLS ポリシーが有効化。
- 監査ログ (Durable Object -> BigQuery) が記録されることを確認。
