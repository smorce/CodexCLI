**Issue タイトル**: `[Impl] IndexConstituentService: index-constituent-sync (TDD)`

---

このリポジトリでは、TopTenFrontierを構築しています。

TopTenFrontierにおいて現在、IndexConstituentServiceマイクロサービスが実装されていません。このマイクロサービスは、安全にかつ確実に実装するために、**documents/IndexConstituentService_ImplPlan.md** に記載された実装計画に沿って、詳細設計書とOpenAPI仕様書に厳密に従って実装する必要があります。

### 詳細

**IndexConstituentService** は、TopTenFrontierを構成するマイクロサービスの一つです。documents/TopTenFrontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。このサービスの詳細設計は documents/IndexConstituentService_Design.md に記載されています。実装は TDD と Tidy First を厳格に適用し、documents/IndexConstituentService_ImplPlan.md の手順を忠実に反映してください。

### 参照ドキュメント

- documents/TopTenFrontier_Architecture.md
- documents/IndexConstituentService_Design.md
- documents/IndexConstituentService_OpenAPI.yaml
- documents/IndexConstituentService_ImplPlan.md
- TopTenFrontier/temp/index-constituent-sync.sow.md

### 作業内容

- **TDD/Tidy Firstの厳守**:
  1. **Red**: これから実装する機能に対する失敗するテストを最初に書くこと。
  2. **Green**: テストをパスさせるための最小限のコードを実装すること。
  3. **Refactor**: テストがパスした後、コードの重複排除や可読性向上などのリファクタリングを行うこと。
  4. 構造的変更（リファクタリング）と振る舞いの変更（機能追加）は、必ず別々のコミットに分離すること。
- **API/モデル**: 設計書とOpenAPIに厳密に一致させること。
- **セキュリティ**: Supabase AuthによるJWTを検証し、RLSポリシーと連携した認可制御を実装すること。
- **永続化**: Neon (PostgreSQL) をターゲットとし、Prisma Data Proxy等を用いてアクセスすること。
- **テスト**: 単体/統合テストをTDDプロセスで作成し、API契約テストでOpenAPI準拠を検証すること。

### 推奨する実装フェーズ

1. **Tidy First (構造変更のみ)**
   - Prisma schema に index_constituent スキーマ追加とマイグレーション生成。
   - 共通ライブラリに必要な型 (OrgContext など) を補完し、構造変更コミットで分離。
2. **エンドポイント別TDDサイクル**
   - GET `/v1/constituents/top10`: キャッシュ・レスポンス形状をテスト → 最小実装 → DTO/メトリクス整備。
   - GET `/v1/constituents/history`: ページング/カーソルの境界テスト → SQL実装 → カーソル生成共通化。
   - GET `/v1/constituents/changes`: フィルタ/422/Queue互換性テスト → 実装 → ChangeEvent 型抽出。
   - POST `/v1/constituents/sync`: 権限制御/重複ジョブテスト → Durable Object & 外部API呼出 → バックオフ設定化。
   - GET `/v1/constituents/providers/status`: 空データ/異常ケーステスト → Prisma実装 → 整形共通化。
3. **イベント発行と外部連携**
   - Cloudflare Queue への ChangeEvent publish をテストで固定化し、同期ジョブ完了時に実装。
   - 外部 API はモック (WireMock 等) を用いて 429/障害時のリトライを TDD で保証。
4. **検証ステップ**
   - OpenAPI 契約テスト (Dredd/Schemathesis) で全エンドポイントを検証。
   - Supabase Auth/RLS テスト、Durable Object 状態遷移テスト、Queue payload チェックを実施。

### コミット規律

- 構造変更 (スキーマ/共通抽出) と振る舞い変更を別コミットに分離すること。
- 各 Red → Green → Refactor サイクルごとにテストを実行し、Green 状態でのみリファクタリングすること。

### 完了条件

- 設計書・OpenAPI・実装計画に完全準拠したサービスが実装され、PR が作成されていること。
- Supabase Auth/RLS、Queue 連携、Durable Object の挙動がテストで担保されていること。
- 監査ログ・メトリクス計測を含む全テストがパスし、論理単位コミットで構造変更と振る舞い変更が分離されていること。

### 最終チェック

- `npm run build && npm test`
