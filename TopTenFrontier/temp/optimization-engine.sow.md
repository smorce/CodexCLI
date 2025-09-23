# SOW: OptimizationService - Efficient Frontier Engine

## 1. タスク概要
平均分散最適化ジョブと効率的フロンティア API を提供する OptimizationService を実装する。Design/OpenAPI/ImplPlan に従い、ジョブ管理・Wasm 計算・Queue 通知を完成させる。目標は 10 銘柄・制約下で 1 秒未満のフロンティア計算を達成すること。

## 2. 設計パターンの検討
### 2.1 要点
- 高計算負荷であり、Workers Unbound + Wasm を活用。
- 非同期ジョブ管理が必要。状態遷移を厳格に制御。
- 数値安定性が重要 (共分散行列が特異になる可能性)。

### 2.2 候補
1. **Durable Object キュー + Wasm (集中管理)**
2. **Queue → Worker Subrequest (完全非同期)**
3. **外部 FaaS (Supabase Functions/Rust) と連携**
4. **コンテナベース (Fly.io/Cloud Run)**

### 2.3 比較
- (1) は Cloudflare ネイティブでレイテンシが低く、ジョブ状態を簡潔に管理できる。
- (2) は複数 Worker 間で状態が分散し、冪等制御が難しい。
- (3) は別ランタイム管理が必要で遅延増大。
- (4) は強力だが管理コスト高。Workers で完結しない。

### 2.4 最終決定
- **採用: (1) Durable Object キュー + Wasm**。ジョブ順序を保証しつつ、Workers Unbound に処理を委譲して高計算負荷を捌く。数値モジュールは Rust/Wasm で実装し、テストしやすくする。

## 3. 実装計画 (TDD)
1. Prisma スキーマ追加 (構造コミット)。
2. ジョブ作成・状態取得・キャンセル・フロンティア取得・プレビューの順で API TDD。
3. Wasm 数値モジュールのユニットテスト (Rust 側)。
4. Queue 通知の契約テスト (PortfolioManagementService モック)。
5. k6 でジョブ完了時間を計測 (p95 < 1.5 秒)。

## 4. ユーザー向けタスク
- Cloudflare Workers Unbound を有効化 (アカウント設定確認)。
- Rust/Wasm ビルド用の CI ランナー (wasm-pack) を準備。
- 監査用 BigQuery テーブル (optimization_jobs_audit) を作成。
