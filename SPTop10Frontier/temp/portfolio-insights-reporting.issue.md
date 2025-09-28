Issue タイトル: [Impl] PortfolioInsightsService: Reporting Pipeline (TDD)

このリポジトリでは、SPTop10Frontier を構築しています。
SPTop10Frontier において現在、PortfolioInsightsService マイクロサービスが実装されていません。
このマイクロサービスは、安全にかつ確実に実装するために、documents/PortfolioInsightsService_ImplPlan.md に記載された実装計画に沿って、詳細設計書と OpenAPI 仕様書に厳密に従って実装する必要があります。

### 詳細

PortfolioInsightsService は、SPTop10Frontier を構成するマイクロサービスの一つです。
このサービスは、documents/SPTop10Frontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。
このサービスの詳細設計は documents/PortfolioInsightsService_Design.md に記載されています。実装は documents/PortfolioInsightsService_ImplPlan.md の手順に従ってください。

### コーディング規約

- 基本原則: YAGNI、DRY、KISS。
- マイクロサービス実装基準: 以下のチェックリストを厳密に適用。

### 参照ドキュメント

- 全体アーキテクチャ仕様書: documents/SPTop10Frontier_Architecture.md
- 詳細設計書: documents/PortfolioInsightsService_Design.md
- OpenAPI 仕様書: documents/PortfolioInsightsService_OpenAPI.yaml
- 実装計画書: documents/PortfolioInsightsService_ImplPlan.md
- SOW: SPTop10Frontier/temp/portfolio-insights.sow.md

これ以外のドキュメントは参照禁止です。

### 作業指示

ステップ5（TDD）を開始し、実装計画書の順序で処理してください。

### 制約条件

- TDD/Tidy First の厳守。
- API とモデルは設計・OpenAPI と一致させる。
- 認証・認可は Supabase Auth と RLS に合わせる。
- Neon を利用したデータ永続化。
- レポート生成は非同期ワーカーで行い、再試行と署名付き URL を実装。
- OpenAPI 契約テストとレンダリングテストを必ず実施。

### マイクロサービス実装チェックリスト

#### [ ] サービス設計と境界
  - [ ] 高凝集・疎結合か？
  - [ ] 独立デプロイ可能か？

#### [ ] データ管理
  - [ ] Database per Service を守っているか？
  - [ ] トランザクション境界は適切か？
  - [ ] 結果整合性向上のためのイベント処理が設計されているか？
      - [ ] 必要な補償処理がテストされているか？
  - [ ] CQRS を検討したか？

#### [ ] 通信と API 契約
  - [ ] OpenAPI.yaml と一致しているか？
  - [ ] プロトコルの選択は妥当か？
  - [ ] 入力検証は十分か？
  - [ ] エラーレスポンスは共通フォーマットか？

#### [ ] 耐障害性
  - [ ] サーキットブレーカーを適用しているか？
  - [ ] タイムアウト設定があるか？
  - [ ] リトライ戦略と冪等性が確保されているか？
  - [ ] フォールバック処理が用意されているか？

#### [ ] オブザーバビリティ
  - [ ] traceparent を伝播しているか？
  - [ ] 構造化ログが整備されているか？
  - [ ] メトリクスが記録されているか？

### 禁止事項

- 追加の準備作業や他ドキュメントの参照は禁止です。

### 完了条件

- 設計と OpenAPI を満たす実装を完了し PR として提出すること。
- 全テストをパスさせること。
- コミットを構造的変更と振る舞いの変更に分割すること。
  - チェックリストの全項目を満たすこと。
