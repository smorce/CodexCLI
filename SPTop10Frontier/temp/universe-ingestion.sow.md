# SOW: Universe Ingestion Service

## 1. タスク概要
- 目的: S&P 500 上位 10 銘柄の構成を日次で同期し、API/イベント経由で他サービスに提供する Universe Ingestion Service を設計書通りに実装する。
- ゴール: OpenAPI と実装計画書の要求を満たす API (GET /universe/top10, POST /universe/sync, GET /universe/sync/{id}) と Cron ベースの同期ワーカーを TDD で完成させる。

## 2. 設計パターンの検討
### 2.1 要点の整理
- 外部データプロバイダへの信頼性確保、失敗時の再試行。
- 最新 snapshot の高速提供 (p95 < 200ms) と履歴保持。
- 冪等な同期ジョブと競合防止。
- イベント駆動で下流サービスへ通知。

### 2.2 候補パターン
1. **Durable Object + Queue によるワークキュー管理**
2. **Event Sourcing (snapshot をイベントで再構築)**
3. **CQRS + Read Model キャッシュ**
4. **単純な Cron + 直接 DB 書き込み**

### 2.3 候補比較
- Durable Object + Queue: 競合制御と再試行に優れるが実装複雑度やや高。
- Event Sourcing: フル履歴管理可能だが、必要以上に複雑でストレージ増大。
- CQRS + キャッシュ: 読み取り性能向上、設計書の高速レスポンス要件と一致。
- 単純 Cron: シンプルだが競合/再試行や通知連携が脆弱。

### 2.4 最終決定
- **採用パターン**: Durable Object + Queue を用いたワークキュー管理 + CQRS 的読み取りキャッシュ。
- **理由**: 同期ジョブの重複防止と再試行制御を Durable Object で実現しつつ、Cloudflare KV を Read Model として活用することで、設計書で求められる高速レスポンスと堅牢性を両立できるため。

## 3. 実装計画 (TDD ベース)
1. Prisma スキーマ & マイグレーション (Red/Green/Refactor)。
2. GET /universe/top10 のテスト追加 → 実装 → リファクタ。
3. POST /universe/sync の RBAC & 競合テスト → Durable Object + Queue 実装。
4. GET /universe/sync/{id} の状態取得テスト → 実装。
5. Cron ワーカーの統合テスト (外部 API モック) → 実装。
6. UniverseUpdated イベント配信テスト → 実装。
7. ログ/メトリクス/トレースのテスト → 実装。
- 各ステップで Tidy First を意識し、構造変更と機能追加を分離。

## 4. ユーザー向けタスクリスト
- IEX Cloud または同等データ提供サービスの API キーを Secrets Manager に登録し、環境変数 IEX_API_KEY を設定。
- Cloudflare Workers と Neon を接続するための環境変数 (DATABASE_URL) を用意。
- Cloudflare Queue と Durable Object のバインディング (wrangler.toml) を作成。
- Datadog API Key を Workers Secrets に登録し、ログ/メトリクス送信を許可。

## 5. 合意事項
- 本 SOW に従い、Universe Ingestion Service 実装を開始する前にユーザー確認を受ける。
