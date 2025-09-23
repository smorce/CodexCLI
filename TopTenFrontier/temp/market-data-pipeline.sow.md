# SOW: MarketDataService - Market Data Pipeline

## 1. タスク概要
Top10 銘柄の価格・リターン・共分散データを収集・加工し、API で提供するサービスを実装する。目標は IndexConstituentService のイベントに追随し、OptimizationService に必要な統計値を遅延 < 5 分で供給すること。Design/OpenAPI/ImplPlan に従うこと。

## 2. 設計パターンの検討
### 2.1 要点
- インジェスト量は Top10 × (日次 + 分足) と限定的。レート制限が主な制約。
- 計算コストが高い (共分散)。Workers Unbound を利用。
- 再計算は同一パラメータでキャッシュしたい。

### 2.2 候補
1. **バッチポーリング + 集約テーブル**
2. **リアルタイムストリーミング (Kafka → Workers)**
3. **Lambda アーキテクチャ (スピード/バッチレイヤ)**
4. **CDC + Materialized Views**

### 2.3 比較
- (1) は実装がシンプル。Top10 の規模なら十分。バッチ取得 → 差分挿入で良い。
- (2) は低遅延だが Cloudflare Workers で Kafka 操作が複雑、過剰。
- (3) は大量データ向け。Top10 では過剰。
- (4) は CDC 基盤が必要で初期構築が重い。

### 2.4 最終決定
- **採用: (1) バッチポーリング + 集約テーブル**。Durable Object がスケジュール駆動でデータを取得し、Prisma で upsert。共分散は Wasm で再計算し結果を JSONB に保存。Cache/R2 で再利用。

## 3. 実装計画 (TDD)
1. Prisma スキーマ追加 (構造コミット)。
2. GET /returns → GET /covariance → GET /statistics → POST /ingest → GET /health の順で TDD。
3. Wasm 共分散計算の Golden テスト。
4. Queue (marketdata.ingest) の契約テスト。
5. k6 で /returns p95 <200ms を確認。

## 4. ユーザー向けタスク
- Polygon.io 高頻度データ (分足) プランの契約状況確認。
- Cloudflare R2 バケットを作成し、Workers Bindings を設定。
- MarketData 用の Supabase RLS ポリシーに必要な組織 ID を登録。
