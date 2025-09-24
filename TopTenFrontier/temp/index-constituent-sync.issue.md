**Issue タイトル**: `[Impl] IndexConstituentService: index-constituent-sync (TDD)`

---

このリポジトリでは、TopTenFrontierを構築しています。

TopTenFrontierにおいて現在、IndexConstituentServiceマイクロサービスが実装されていません。このマイクロサービスは、安全にかつ確実に実装するために、**TopTenFrontier/documents/IndexConstituentService_ImplPlan.md** に記載された実装計画に沿って、詳細設計書とOpenAPI仕様書に厳密に従って実装する必要があります。

### 詳細

**IndexConstituentService** は、TopTenFrontierを構成するマイクロサービスの一つです。TopTenFrontier/documents/TopTenFrontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。このサービスの詳細設計は TopTenFrontier/documents/IndexConstituentService_Design.md に記載されています。実装は TDD と Tidy First を厳格に適用し、TopTenFrontier/documents/IndexConstituentService_ImplPlan.md の手順を忠実に反映してください。

### 参照ドキュメント

- TopTenFrontier/documents/TopTenFrontier_Architecture.md
- TopTenFrontier/documents/IndexConstituentService_Design.md
- TopTenFrontier/documents/IndexConstituentService_OpenAPI.yaml
- TopTenFrontier/documents/IndexConstituentService_ImplPlan.md
- TopTenFrontier/temp/index-constituent-sync.sow.md

### 実装タスク (Tidy First → TDD)

1. **Tidy First (構造変更のみ)**
   - Prisma schema に index_constituent スキーマ追加とマイグレーション生成。
   - 共通ライブラリに必要な型 (OrgContext など) を補完し、構造変更コミットで分離。
2. **エンドポイントTDDサイクル**
   - GET `/v1/constituents/top10`: キャッシュ・レスポンス形状をテスト→最小実装→DTO/メトリクス整備。
   - GET `/v1/constituents/history`: ページング/カーソルの境界テスト→SQL実装→カーソル生成共通化。
   - GET `/v1/constituents/changes`: フィルタ/422/Queue互換性テスト→実装→ChangeEvent 型抽出。
   - POST `/v1/constituents/sync`: 権限制御/重複ジョブテスト→Durable Object & 外部API呼出→バックオフ設定化。
   - GET `/v1/constituents/providers/status`: 空データ/異常ケーステスト→Prisma実装→整形共通化。
3. **イベント発行と外部連携**
   - Cloudflare Queue への ChangeEvent publish をテストで固定化し、同期ジョブ完了時に実装。
   - 外部 API は WireMock 等でモックし、429/障害時のリトライを TDD で保証。
4. **検証ステップ**
   - OpenAPI 契約テスト (Dredd/Schemathesis) で全エンドポイントを検証。
   - Supabase Auth/RLS テスト、Durable Object 状態遷移テスト、Queue payload チェックを実施。

### コミット規律 (Tidy First)

- 構造変更 (スキーマ/共通抽出) と振る舞い変更を別コミットに分離。
- 各 Red → Green → Refactor サイクルごとにテストを実行し、Green 状態でのみリファクタリング。

### 完了条件

- 設計書・OpenAPI・実装計画に完全準拠したサービスが実装され、PR が作成されていること。
- Supabase Auth/RLS、Queue 連携、Durable Object の挙動がテストで担保されていること。
- 監査ログ・メトリクス計測を含む全テストがパスし、論理単位コミットで構造変更と振る舞い変更が分離されていること。

### 最終チェック

- `npm run build && npm test`
