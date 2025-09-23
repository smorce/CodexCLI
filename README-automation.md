# TopTenFrontier - Issue ドリブン自動開発システム

## 🚀 クイックスタート

### 1. 自動実装の開始

1. **Issue を作成**
   - GitHub で新しい Issue を作成
   - [Codex自動実装テンプレート](.github/ISSUE_TEMPLATE/codex-implementation.md) を使用推奨

2. **ラベルを追加**
   ```
   codex
   ```

3. **自動実装の実行**
   - GitHub Actions が自動的に開始
   - 約 5-15 分で PR が作成される

4. **レビューとマージ**
   - 自動生成された PR をレビュー
   - 問題なければマージ

## 🎯 対応可能な実装タイプ

### マイクロサービス実装
- **IndexConstituentService**: S&P 500 構成銘柄管理
- **MarketDataService**: 市場データ収集・加工
- **OptimizationService**: ポートフォリオ最適化エンジン
- **PortfolioManagementService**: ポートフォリオ管理・レポート

### API エンドポイント追加
```typescript
// 例: 新しいエンドポイント
GET /api/v1/constituents/history
POST /api/v1/optimization/jobs
PUT /api/v1/portfolios/{id}/approve
```

### データベーススキーマ変更
```sql
-- 例: 新しいテーブル追加
CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY,
  portfolio_id UUID REFERENCES portfolios(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 📋 実装例

### 例1: API エンドポイント追加

**Issue タイトル**: `[AUTO] MarketDataService: 過去30日間の価格履歴API追加`

**Issue 内容**:
```markdown
## 実装要求
MarketDataServiceに過去30日間の株価履歴を取得するAPIを追加

## API仕様
- エンドポイント: GET /api/v1/market-data/prices/history
- パラメータ: symbol (string), days (number, default: 30)
- 認証: JWT必須
- レスポンス: 日次価格データの配列

## セキュリティ要件
- [x] JWT認証
- [x] RLSポリシー適用
- [x] 入力値検証

## テスト要件
- [x] 単体テスト
- [x] 統合テスト
- [x] OpenAPI契約テスト
```

### 例2: データモデル拡張

**Issue タイトル**: `[AUTO] PortfolioManagementService: リスク指標テーブル追加`

**Issue 内容**:
```markdown
## 実装要求
ポートフォリオのリスク指標を保存するテーブルとAPIを追加

## データモデル
```sql
CREATE TABLE portfolio_risk_metrics (
  id UUID PRIMARY KEY,
  portfolio_id UUID REFERENCES portfolios(id),
  var_95 DECIMAL(10,4),
  sharpe_ratio DECIMAL(8,4),
  max_drawdown DECIMAL(8,4),
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API仕様
- POST /api/v1/portfolios/{id}/risk-metrics
- GET /api/v1/portfolios/{id}/risk-metrics
```

## 🔧 高度な設定

### カスタムプロンプト

Issue に以下のセクションを追加することで、実装方針をカスタマイズできます：

```markdown
## 🎨 カスタム実装方針

### 特別な要求
- 外部API (Polygon.io) との連携
- WebAssembly モジュールの使用
- 特定のデザインパターンの適用

### パフォーマンス最適化
- キャッシュ戦略の実装
- バッチ処理の最適化
- 並列処理の活用
```

### 段階的実装

大きな機能は複数の Issue に分割することを推奨：

1. **Phase 1**: データモデル定義
2. **Phase 2**: 基本 CRUD API
3. **Phase 3**: ビジネスロジック実装
4. **Phase 4**: 統合・最適化

## 🚨 制限事項

### 対応できない実装
- 外部システムとの複雑な連携設定
- インフラストラクチャの変更
- セキュリティ設定の変更
- 本番環境への直接デプロイ

### 手動対応が必要な作業
- API キーの設定
- 環境変数の追加
- データベースマイグレーション実行
- 本番デプロイの承認

## 📊 成功指標

### 自動化の効果測定

- **実装速度**: Issue 作成から PR 完了まで平均 10 分
- **品質**: 自動生成コードのテストカバレッジ 80% 以上
- **整合性**: OpenAPI 仕様準拠率 100%
- **セキュリティ**: 自動セキュリティチェック通過率 100%

## 🤝 コントリビューション

### フィードバック

自動実装システムの改善提案は以下で受け付けています：

1. **Issue** での機能要求・バグ報告
2. **Discussion** での改善アイデア共有
3. **PR** でのワークフロー改善

### ベストプラクティス共有

成功した実装パターンは [Wiki](../../wiki) で共有しています：

- 効果的な Issue 記述方法
- 複雑な要求の分割戦略
- レビュー時のチェックポイント

---

## 📚 関連ドキュメント

- [GitHub Actions 自動化詳細](docs/github-actions-automation.md)
- [TopTenFrontier アーキテクチャ](TopTenFrontier/documents/TopTenFrontier_Architecture.md)
- [開発ガイドライン](prompts/Instructions.md)

---

**🎉 Happy Coding with AI!** 

このシステムにより、アイデアから実装まで数分で完了する、未来の開発体験を実現しています。
