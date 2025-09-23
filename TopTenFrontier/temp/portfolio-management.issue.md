このリポジトリでは、TopTenFrontierを構築しています。

TopTenFrontierにおいて現在、PortfolioManagementServiceマイクロサービスが実装されていません。

このマイクロサービスは、安全にかつ確実に実装するために、**documents/PortfolioManagementService_ImplPlan.mdに記載された実装計画**に沿って、詳細設計書とOpenAPI仕様書に厳密に従って実装する必要があります。

### 詳細

**PortfolioManagementService** は、TopTenFrontierを構成するマイクロサービスの一つです。

このサービスは、documents/TopTenFrontier_Architecture.md に記載されている他のマイクロサービスと連携して動作します。

このサービスの詳細設計は documents/PortfolioManagementService_Design.md に記載されています。このマイクロサービスを段階的かつ安全に実装するため、documents/PortfolioManagementService_ImplPlan.md に記載された手順に厳密に従ってください。

上記の仕様書群を十分に理解した上で、手順通りに実装を進めてください。

### 参照ドキュメント

-   **全体アーキテクチャ仕様書**: documents/TopTenFrontier_Architecture.md
-   **詳細設計書**: documents/PortfolioManagementService_Design.md
-   **OpenAPI仕様書**: documents/PortfolioManagementService_OpenAPI.yaml
-   **実装計画書**: documents/PortfolioManagementService_ImplPlan.md
-   **SOW**: TopTenFrontier/temp/portfolio-management.sow.md

### 作業内容

-   **TDD/Tidy Firstの厳守**:
    1.  **Red**: これから実装する機能に対する**失敗するテスト**を最初に書くこと。
    2.  **Green**: テストをパスさせるための**最小限のコード**を実装すること。
    3.  **Refactor**: テストがパスした後、コードの重複排除や可読性向上などのリファクタリングを行うこと。
    4.  **構造的変更**（リファクタリング）と**振る舞いの変更**（機能追加）は、**必ず別々のコミットに分離**すること。
-   **API/モデル**: 設計書とOpenAPIに**厳密に一致**させること。
-   **セキュリティ**: Supabase AuthによるJWTを検証し、RLSポリシーと連携した認可制御を実装すること。
-   **永続化**: Neon (PostgreSQL) をターゲットとし、Prisma Data Proxy等を用いてアクセスする。
-   **テスト**: 単体/統合テストをTDDプロセスで作成し、API契約テストでOpenAPI準拠を検証すること。

### 完了条件

-   設計/OpenAPIを満たすサービスが実装され、PRとして提出されること。
-   すべてのテストがパスしていること。
-   コミットが論理単位で、かつ「構造的変更」と「振る舞いの変更」に明確に分離されていること。

