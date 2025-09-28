Issue タイトル: [Impl] MarketDataService: Core Analytics (TDD)

このリポジトリでは、SPTop10Frontier を構築しています。
SPTop10Frontier において現在、MarketDataService マイクロサービスが実装されていません。
このマイクロサービスは、安全にかつ確実に実装するために、documents/MarketDataService_ImplPlan.md に記載された実装計画に沿って、詳細設計書と OpenAPI 仕様書に厳密に従って実装する必要があります。

### 詳細

MarketDataService は、SPTop10Frontier を構成するマイクロサービスの一つです。
このサービスは、documents/SPTop10Frontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。
このサービスの詳細設計は documents/MarketDataService_Design.md に記載されています。このマイクロサービスを段階的かつ安全に実装するため、documents/MarketDataService_ImplPlan.md に記載された手順に厳密に従ってください。
上記の仕様書群を十分に理解した上で、手順通りに実装を進めてください。

### コーディング規約

-   基本原則の徹底: YAGNI、DRY、KISS の原則を適用します。
  - マイクロサービス実装基準: 実装中は常に「マイクロサービス実装チェックリスト」を参照し、分散システムとしての品質基準を満たすようにします。

### 参照ドキュメント

-   全体アーキテクチャ仕様書: documents/SPTop10Frontier_Architecture.md
-   詳細設計書: documents/MarketDataService_Design.md
-   OpenAPI 仕様書: documents/MarketDataService_OpenAPI.yaml
-   実装計画書: documents/MarketDataService_ImplPlan.md
-   SOW: SPTop10Frontier/temp/market-data.sow.md

上記以外のドキュメントは確認しないでください。

### 作業指示

現在ステップ4までの準備が完了しています。あなたのタスクはステップ5（TDDによる実装）を開始することです。
実装計画書に記載された最初のステップから着手してください。

### 制約条件

-   TDD/Tidy First を厳守すること。
-   API とデータモデルを OpenAPI と設計書に合わせること。
-   Supabase Auth による JWT 検証と RLS を実装すること。
-   永続化は Neon を利用し、Prisma などの公式クライアントでアクセスすること。
-   単体・統合・契約テストを TDD プロセスで作成すること。

### マイクロサービス実装チェックリスト

#### [ ] サービス設計と境界

  - [ ] 疎結合と高凝集を満たしているか？
  - [ ] 独立したデプロイが可能か？

#### [ ] データ管理

  - [ ] Database per Service を守っているか？
  - [ ] トランザクション境界は適切か？
  - [ ] 結果整合性に向けた対策があるか？
      - [ ] 必要なら補償トランザクション等をテスト済みか？
  - [ ] CQRS の検討が行われているか？

#### [ ] 通信と API 契約

  - [ ] OpenAPI.yaml と一致しているか？
  - [ ] プロトコル選択は適切か？
  - [ ] 入力検証は十分か？
  - [ ] エラーレスポンスは共通フォーマットか？

#### [ ] 耐障害性

  - [ ] サーキットブレーカーを適用しているか？
  - [ ] タイムアウト設定は適切か？
  - [ ] リトライ戦略は冪等性を満たすか？
  - [ ] フォールバック処理があるか？

#### [ ] オブザーバビリティ

  - [ ] traceparent を含む分散トレーシングを実装しているか？
  - [ ] 構造化ログで機密情報が排除されているか？
  - [ ] メトリクス監視が整備されているか？

### 禁止事項

- ドキュメントのコピーや移動、追加の準備作業は不要です。

### 完了条件

-   設計と OpenAPI を満たす実装が完了し PR として提出されること。
-   すべてのテストがパスしていること。
-   コミットが論理単位で構造的変更と振る舞いの変更に分離されていること。
  - マイクロサービス実装チェックリストの要件を満たしていること。
