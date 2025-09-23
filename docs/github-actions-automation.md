# GitHub Actions による Issue ドリブン自動開発

このドキュメントでは、TopTenFrontier プロジェクトで実装されている Issue 発行から PR 作成までの自動化システムについて説明します。

## 🎯 概要

GitHub Actions と OpenAI Codex CLI を活用して、以下のワークフローを自動化しています：

1. **Issue → 自動実装 → PR 作成**
2. **PR 作成 → 自動要約コメント**

これにより、開発者は Issue を作成するだけで、AI が自動的にコードを実装し、レビュー可能な PR を作成します。

## 🔧 セットアップ

### 1. 必要なシークレットの設定

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定：

```
OPENAI_API_KEY: OpenAI の API キー
```

### 2. 権限の確認

ワークフローには以下の権限が必要です：
- `contents: write` - コードの変更とコミット
- `pull-requests: write` - PR の作成とコメント
- `actions: write` - ワークフローの実行
- `issues: read` - Issue 情報の読み取り

## 🚀 使い方

### Issue から自動実装への流れ

1. **Issue の作成**
   - 通常通り GitHub Issue を作成
   - 実装したい機能や修正内容を詳細に記述

2. **ラベルの追加**
   - Issue に `codex` ラベルを追加
   - これがトリガーとなり自動実装が開始

3. **自動実装の実行**
   - GitHub Actions が起動
   - Codex CLI が Issue 内容を解析
   - TDD 原則に基づいて実装を実行
   - 新しいブランチ `codex/issue-{番号}` を作成

4. **PR の自動作成**
   - 実装完了後、自動的に PR を作成
   - Issue へのコメントで完了通知

5. **PR 要約の自動生成**
   - PR 作成時に変更内容を自動要約
   - 技術的な観点からレビューポイントを提示

## 📋 ワークフローの詳細

### issue-to-pr.yaml

**トリガー**: Issue に `codex` ラベルが追加されたとき

**主な処理**:
1. 新しいブランチの作成
2. Issue 内容から実装プロンプトを生成
3. Codex CLI による自動実装
4. コミットと PR 作成
5. Issue へのフィードバックコメント

**生成されるブランチ名**: `codex/issue-{Issue番号}`

**コミットメッセージ形式**:
```
feat: #{Issue番号} - {Issueタイトル}

Automated implementation by Codex CLI based on issue requirements.

Closes #{Issue番号}
```

### pr-summary.yaml

**トリガー**: PR が作成されたとき

**主な処理**:
1. PR の差分を取得
2. TopTenFrontier プロジェクト用のプロンプトで要約生成
3. 技術的な観点からの分析
4. サービス名に基づくラベル自動付与

**要約に含まれる項目**:
- 🎯 主な変更内容
- 🏗️ アーキテクチャ影響
- 🧪 テスト関連
- 📋 API 変更
- 🔒 セキュリティ関連
- ⚠️ レビュー時の注意点

## 💡 Best Practices

### Issue 作成時のコツ

1. **明確な要求仕様**
   ```markdown
   ## 要求
   IndexConstituentService に新しい API エンドポイントを追加

   ## 詳細
   - エンドポイント: GET /api/v1/constituents/history
   - 機能: 過去の構成銘柄履歴を取得
   - 認証: JWT 必須
   - レスポンス: OpenAPI 仕様に準拠
   ```

2. **技術的制約の明記**
   ```markdown
   ## 制約条件
   - TDD（Red-Green-Refactor）の厳格な遵守
   - Prisma ORM を使用
   - RLS ポリシーの適用
   - OpenAPI 仕様との整合性確保
   ```

3. **テスト要件の指定**
   ```markdown
   ## テスト要件
   - 単体テスト: 各ハンドラー関数
   - 統合テスト: API エンドポイント
   - 契約テスト: OpenAPI 準拠確認
   ```

### レビュー時のポイント

1. **自動生成コードの品質確認**
   - TDD サイクルの適切な実行
   - コミット分離（構造変更 vs 機能変更）
   - テストカバレッジの確認

2. **仕様準拠性**
   - OpenAPI 仕様との整合性
   - アーキテクチャ設計書との一致
   - セキュリティ要件の実装

3. **コード品質**
   - 命名規則の遵守
   - エラーハンドリングの適切性
   - パフォーマンスの考慮

## 🔍 トラブルシューティング

### よくある問題と解決策

1. **Codex CLI の実行エラー**
   ```
   Error: OpenAI API key not found
   ```
   → `OPENAI_API_KEY` シークレットの設定を確認

2. **ブランチ作成エラー**
   ```
   fatal: A branch named 'codex/issue-123' already exists
   ```
   → 既存ブランチを削除するか、Issue を再作成

3. **PR 作成権限エラー**
   ```
   Error: Resource not accessible by integration
   ```
   → GitHub Actions の権限設定を確認

### デバッグ方法

1. **ワークフロー実行ログの確認**
   - GitHub の Actions タブで詳細ログを確認
   - 各ステップの実行結果をチェック

2. **Codex 実行結果の確認**
   - 生成されたコードの品質確認
   - テスト実行結果の確認

## 🚧 今後の拡張予定

1. **外部 AI エージェントとの連携**
   - 大きなプロジェクト構想を細かい Issue に自動分解
   - MCP を通じた Issue 自動発行

2. **マージ後の自動化**
   - main へのマージをトリガーとした次の Issue 自動作成
   - 完全自律的開発ループの実現

3. **品質ゲートの強化**
   - 自動コードレビュー
   - セキュリティスキャン
   - パフォーマンステスト

## 📚 参考資料

- [GitHub ActionsとCodexでIssueドリブンな自動開発を行う](https://zenn.dev/yutapon_juice/articles/0f32478deb0c53)
- [OpenAI Codex CLI ドキュメント](https://github.com/openai/codex-cli)
- [TopTenFrontier アーキテクチャ仕様書](../TopTenFrontier/documents/TopTenFrontier_Architecture.md)

---

このシステムにより、**人間は新たな Issue を投げるだけ**で開発が自動的に進む理想的な開発環境を実現しています。
