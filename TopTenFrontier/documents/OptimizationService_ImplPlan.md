# OptimizationService Implementation Plan

## 1. 概要
- 目的: 平均分散最適化ジョブとフロンティア計算 API を実装し、Design/OpenAPI を満たす。
- 範囲: REST ハンドラ、Durable Object キュー、Wasm 数値計算モジュール、Neon 永続化、Queue 通知。

## 2. セットアップ
- Rust/Wasm モジュール (nalgebra, serde_wasm_bindgen) を packages/optimization-core にビルド。uv toolchain + wasm-pack。
- Prisma schema に optimization テーブルを追加。マイグレーションは別コミット。
- Cloudflare Workers プロジェクトに Durable Object OptimizationCoordinator を登録。

## 3. テスト戦略
- ユニット: 入力検証、Durable Object 状態遷移、Wasm I/O。
- 数値回帰: Golden dataset を使い Markowitz サンプル結果と比較 (許容誤差 1e-6)。
- プロパティ: フロンティア点は expectedReturn が単調増加・volatility が単調増加。
- 統合: MarketDataService モックを用いた end-to-end (ジョブ作成 → 完了 → Queue 通知)。
- レジレッション: 422/409/404 の例外シナリオをカバー。

## 4. 実装手順
### 4.1 Tidy First
- 共通バリデーションユーティリティ (alidateEnum, parseDate) を再利用できるよう整備。
- 既存 Queue 発行ヘルパーを抽象化し、Optimization 用トピックを追加。

### 4.2 API 別 TDD
1. POST /jobs
   - Red: 権限チェック (role=analyst 未満 403)、universe <2 で 422、既存ジョブ競合で 409。
   - Green: Durable Object enqueue + Prisma 永続化。
   - Refactor: DTO/validator 共通化。
2. GET /jobs/{id}
   - Red: 存在しない id で 404、成功レスポンス構造。
   - Green: Prisma join + frontier points取得。
   - Refactor: FrontierPoint DTO 変換抽出。
3. POST /jobs/{id}/cancel
   - Red: 非 QUEUED/RUNNING で 409。
   - Green: Durable Object cancel ロジック。
   - Refactor: 状態遷移マップ抽出。
4. GET /frontier
   - Red: データなし 404、objective Enum バリデーション。
   - Green: 最新成功ジョブの結果取得 + キャッシュ利用。
   - Refactor: Cache/R2 アクセス共通化。
5. POST /frontier/preview
   - Red: 制約違反で 422、成功レスポンス構造。
   - Green: Wasm 軽量実行。
   - Refactor: 制約チェックロジックを共通モジュール化。

### 4.3 ジョブ実行パイプライン
- Red: MarketDataService モックが 422/500 を返すケースでのリトライテスト。
- Green: 外部依存クライアント実装 + リトライ (指数バックオフ)。
- Refactor: 設定をコンフィグファイルに抽出。

## 5. 通知
- Queue optimization.completed の payload 契約テスト。PortfolioManagementService の検証モックを使用。

## 6. パフォーマンス検証
- Workers Unbound CPU 時間 < 400ms/ジョブ を k6 custom script で測定。
- フロンティア計算の精度 (Sharpe 比) を 1e-6 以内で維持。

## 7. 完了条件
- OpenAPI 契約テスト、数値回帰テスト、Queue 通知テストに合格。
- 監査ログ (ジョブ状態変更) が BigQuery に記録される。
- RLS ポリシーが Supabase auth claim に基づき動作。
