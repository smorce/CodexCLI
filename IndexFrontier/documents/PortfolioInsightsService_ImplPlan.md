# PortfolioInsightsService Implementation Plan (TDD)

## スコープ
- OpenAPI 1.0.0 準拠の insights / stream token エンドポイント実装。
- Frontier/Allocation レプリケーション、シナリオワークフローの連携、WebSocket配信セットアップ。
- Neon スキーマ + RLS。

## 前提条件
- PortfolioOptimizationService からの `frontier.completed` キューイベントが存在。
- Notificationサービスと共有する `packages/common/messaging` 利用可能。
- Durable Object Infrastructure (`InsightStreamDO`) 雛形あり。

## Tidy First
1. `packages/portfolio-insights` ディレクトリを作成し、共通HTTPスタックを適用。
2. `adapters/optimizationClient.ts` で最適化サービスAPIクライアントを実装。
3. Drizzle schema (`schema/insights.ts`) とマイグレーション初期化。
4. WebSocketトークン署名ユーティリティを `packages/common/security` に整理。

## TDD サイクル
1. **Red**: `GET /insights/frontiers/latest` 正常ケース (KV hit) テスト。
   - Green: KVキャッシュ + DB fallback 実装。
   - Refactor: キャッシュラッパ抽出。
2. **Red**: 404 ケース（フロンティア未生成）。
3. **Red**: `GET /insights/frontiers/{id}/curve` がフロンティアポイントを返す。
   - Green: DBクエリ + AuditLogMock。
4. **Red**: `GET /insights/allocations` フィルタリングテスト。
5. **Red**: `POST /insights/scenarios` で Temporal ScenarioWorkflow がモック呼び出しされる。
   - Green: Command handler 実装。
6. **Red**: 同エンドポイントで重複シナリオ要求→409。
7. **Red**: `GET /insights/compliance` が drift スコアを返却。
   - Green: Precomputed snapshotクエリ実装。
8. **Red**: `GET /stream/token` で 5分有効のJWT生成を検証。
   - Green: Token signer 実装。
9. **Red**: 認証なし→401、権限不足→403 を全エンドポイントで確認。
10. **Red**: Queueイベントコンシューマ統合テスト（frontier.completed 受信→Insightテーブル更新→キャッシュ無効化）。

## 非機能テスト
- Contract tests (Prism) でOpenAPI整合。
- WebSocket負荷テスト (k6) で 1k 同時接続ハンドリング検証。
- ScenarioWorkflow end-to-end テスト (Temporal test env) で結果がアウトボックスへ記録されること。

## 観測性
- OpenTelemetry span attributes (`frontier_id`, `scenario_id`) チェック。
- Auditログの出力 (curve fetch, scenario request) をモック検証。

## 完了条件
- `uv run --link-mode=copy pnpm test --filter portfolio-insights` Green。
- Drizzle マイグレーションに RLS/インデックス/ビューが含まれる。
- KV/Durable Object バインディングがwrangler設定に反映。
- OpenAPI Contractテスト成功、Queue消費統合テストGreen。
