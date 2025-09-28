Issue タイトル: [Impl] NotificationOrchestrator: Event Dispatch Core (TDD)

このリポジトリでは、SPTop10Frontier を構築しています。
SPTop10Frontier において現在、NotificationOrchestrator マイクロサービスが実装されていません。
このマイクロサービスは、安全にかつ確実に実装するために、documents/NotificationOrchestrator_ImplPlan.md に記載された実装計画に沿って、詳細設計書と OpenAPI 仕様書に厳密に従って実装する必要があります。

### 詳細

NotificationOrchestrator は、SPTop10Frontier を構成するマイクロサービスの一つです。
このサービスは、documents/SPTop10Frontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。
このサービスの詳細設計は documents/NotificationOrchestrator_Design.md に記載されています。実装は documents/NotificationOrchestrator_ImplPlan.md の手順に従ってください。

### コーディング規約

- 基本原則: YAGNI、DRY、KISS。
- マイクロサービス実装基準: 以下のチェックリストを遵守してください。

### 参照ドキュメント

- 全体アーキテクチャ仕様書: documents/SPTop10Frontier_Architecture.md
- 詳細設計書: documents/NotificationOrchestrator_Design.md
- OpenAPI 仕様書: documents/NotificationOrchestrator_OpenAPI.yaml
- 実装計画書: documents/NotificationOrchestrator_ImplPlan.md
- SOW: SPTop10Frontier/temp/notification-orchestrator.sow.md

その他のドキュメントには触れないでください。

### 作業指示

ステップ5（TDD）を開始し、実装計画書に従って処理してください。

### 制約条件

- TDD/Tidy First を厳守すること。
- API とモデルを設計・OpenAPI と一致させること。
- Supabase Auth による JWT 検証と RLS を実装すること。
- Neon を用いたデータ永続化を実施すること。
- 再試行とフォールバック戦略を設計書どおりに実装すること。
- 契約テストおよび外部チャネルモックテストを整備すること。

### マイクロサービス実装チェックリスト

#### [ ] サービス設計と境界
  - [ ] 高凝集・疎結合か？
  - [ ] 独立デプロイ可能か？

#### [ ] データ管理
  - [ ] Database per Service を守っているか？
  - [ ] トランザクション境界は適切か？
  - [ ] 結果整合性の戦略があるか？
      - [ ] 補償処理が必要な場合テスト済みか？
  - [ ] CQRS の検討が行われているか？

#### [ ] 通信と API 契約
  - [ ] OpenAPI.yaml と一致しているか？
  - [ ] プロトコル選択は妥当か？
  - [ ] 入力検証は十分か？
  - [ ] エラーレスポンスは統一されているか？

#### [ ] 耐障害性
  - [ ] サーキットブレーカーを適用しているか？
  - [ ] タイムアウト設定があるか？
  - [ ] リトライ戦略と冪等性が担保されているか？
  - [ ] フォールバック処理が実装されているか？

#### [ ] オブザーバビリティ
  - [ ] traceparent を伝播しているか？
  - [ ] 構造化ログが整備されているか？
  - [ ] メトリクスが取得されているか？

### 禁止事項

- ドキュメントのコピーや移動などの準備作業は不要です。

### 完了条件

- 設計と OpenAPI を満たす実装を完了し PR として提出すること。
- すべてのテストがパスしていること。
- コミットを構造的変更と振る舞いの変更に分割すること。
  - チェックリストの全項目を満たすこと。
