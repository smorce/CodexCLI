# SOW: PortfolioAnalytics Service - Efficient Frontier 実装

## 1. タスク概要
- 目的: PortfolioAnalytics Service における効率的フロンティア計算および最適配分 API を実装し、S&P500 上位10銘柄に対する分析結果を提供可能とする。
- ゴール: OpenAPI 仕様を満たすエンドポイント、Neon へのジョブ永続化、Rust ベースの最適化エンジン、Cloudflare Workers でのジョブ実行フローを完成させる。
- 成果物: 実装コード、単体/統合テスト、観測性設定、更新されたドキュメント類。

## 2. 設計パターン検討
### 2.1 要点
- 計算負荷の高い効率的フロンティア生成を非同期で処理し、複数ユーザーからのリクエストを公平に捌く必要がある。
- MarketData/IndexConstituent など外部依存との連携失敗を吸収しつつ、重複計算を避けたい。
- 制約テンプレートや将来のアルゴリズム拡張 (Top 20, 他指標) に柔軟に対応できる戦略が必要。

### 2.2 候補パターン (3〜5件)
1. Command + Handler パターン: API ごとにコマンドを定義し、ハンドラーで検証とジョブ投入を分離。
2. Saga (イベント駆動) パターン: MarketData 取得→計算→保管→通知を補償アクション付きの Saga で管理。
3. Strategy パターン: 最適化アルゴリズムを戦略として差し替え可能にし、将来のブラックリスト制約や ESG 指標対応を想定。
4. CQRS + Event Sourcing: 書き込み (ジョブ投入) と読み取り (結果取得) をモデル分離し、イベントストアに記録。

### 2.3 候補比較
| パターン | メリット | デメリット | 評価 |
| --- | --- | --- | --- |
| Command + Handler | 入力検証と副作用を分離しテスト容易。Small surface。 | ハンドラー層の肥大化リスク。 | ◎ |
| Saga | 障害時の補償手順を明示できる。イベントで拡張性高い。 | 実装が複雑、今回のフローは3ステップでシンプル。 | ○ |
| Strategy | アルゴリズム差替え・A/B 実験が容易。 | モジュール境界の定義が必要、初期コスト。 | ◎ |
| CQRS + Event Sourcing | 過去結果の完全履歴管理が可能。 | ストレージ/イベント実装コストが大きく、現フェーズでは過剰。 | △ |

### 2.4 最終決定
- 採用: Command + Handler + Strategy の組み合わせ。ジョブ投入を Command/Handler で整理し、計算アルゴリズムは Strategy (MeanVarianceStrategy) とする。
- Saga は軽量版として Cloudflare Queues 上で再実行・補償を行う設計とし、フル Event Sourcing は将来検討に留める。

## 3. 実装計画 (TDD 観点)
1. フェーズA (入力検証): バリデーションテスト → スキーマ実装 → 共有化。
2. フェーズB (永続化): リポジトリテスト → Prisma 実装 → レスポンス整形。
3. フェーズC (外部統合): HTTP クライアントテスト → 実装 → 抽象化。
4. フェーズD (計算エンジン): Rust 単体テスト → WASM 実装 → FFI リファクタ。
5. フェーズE (ジョブ制御): Durable Object シナリオテスト → 実装 → 状態管理共通化。
6. フェーズF (制約テンプレート): RLS テスト → データ取得実装 → キャッシュ導入。
7. 観測性: トレース・メトリクステスト → ミドルウェア実装 → ダッシュボード登録。

## 4. ユーザー側タスクリスト
1. 市場データプロバイダ API キー (例: Polygon.io もしくは Alpha Vantage) を取得し、Cloudflare Workers Secrets に登録。
2. Supabase Auth で org_id / user_id クレームが JWT に含まれるようルールを設定。
3. Neon で analytics 用データベースを作成し、行レベルセキュリティを有効化 (extensions: pgcrypto, pg_stat_statements)。
4. Cloudflare Dashboard で Durable Object ネームスペースと Queues をプロビジョニングし、wrangler.toml にバインドを追加。
5. Stripe メータリング用に Usage Record API キーを確認し、計算クレジット製品を作成。

