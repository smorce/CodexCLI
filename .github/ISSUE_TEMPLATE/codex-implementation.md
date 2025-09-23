---
name: Codex自動実装
about: Codex CLIによる自動実装を要求するためのテンプレート
title: '[AUTO] '
labels: 'codex'
assignees: ''
---

## 🎯 実装要求

### 対象サービス
<!-- どのマイクロサービスに関する実装か -->
- [ ] IndexConstituentService
- [ ] MarketDataService  
- [ ] OptimizationService
- [ ] PortfolioManagementService
- [ ] その他: 

### 機能概要
<!-- 実装したい機能を簡潔に記述 -->


## 📋 詳細仕様

### API仕様
```
エンドポイント: 
メソッド: 
リクエスト: 
レスポンス: 
```

### データモデル
<!-- 必要なデータベーステーブルやスキーマ -->


### ビジネスロジック
<!-- 実装すべきビジネスルールや処理フロー -->


## 🔒 セキュリティ要件

- [ ] JWT認証が必要
- [ ] RLSポリシーの適用
- [ ] 入力値検証
- [ ] 認可制御
- [ ] その他: 

## 🧪 テスト要件

### 必要なテスト
- [ ] 単体テスト（ハンドラー関数）
- [ ] 統合テスト（APIエンドポイント）
- [ ] 契約テスト（OpenAPI準拠）
- [ ] セキュリティテスト
- [ ] パフォーマンステスト

### テストシナリオ
<!-- 具体的なテストケースがあれば記述 -->


## 📚 参照ドキュメント

<!-- 実装時に参照すべきドキュメントを指定 -->
- [ ] アーキテクチャ仕様書: `documents/TopTenFrontier_Architecture.md`
- [ ] 詳細設計書: `documents/{ServiceName}_Design.md`
- [ ] OpenAPI仕様書: `documents/{ServiceName}_OpenAPI.yaml`
- [ ] 実装計画書: `documents/{ServiceName}_ImplPlan.md`
- [ ] SOW: `temp/{task-name}.sow.md`

## ⚙️ 技術的制約

### 必須要件
- [x] TDD（Red-Green-Refactor）の厳格な遵守
- [x] Tidy First原則（構造変更と振る舞い変更の分離）
- [x] OpenAPI仕様との完全な整合性
- [x] Prisma ORMの使用
- [x] TypeScriptでの実装

### アーキテクチャ要件
- [ ] Cloudflare Workers での動作
- [ ] Neon PostgreSQL との連携
- [ ] Supabase Auth との統合
- [ ] イベント駆動アーキテクチャ
- [ ] その他: 

## 🎨 実装方針

### コーディング規約
- 命名規則: キャメルケース（変数・関数）、パスカルケース（クラス・型）
- エラーハンドリング: 統一されたエラーレスポンス形式
- ログ出力: 構造化ログ（JSON形式）
- コメント: JSDoc形式での関数・クラス説明

### パフォーマンス要件
- [ ] API応答時間 p95 < 200ms
- [ ] 同時接続数: 100req/s
- [ ] メモリ使用量制限: 128MB
- [ ] その他: 

## ✅ 完了条件

- [ ] すべてのテストがパス
- [ ] OpenAPI仕様との整合性確認
- [ ] セキュリティ要件の実装確認
- [ ] パフォーマンス要件の達成
- [ ] コードレビューの完了
- [ ] ドキュメントの更新

---

### 📝 補足事項

<!-- その他の重要な情報や特別な要求があれば記述 -->


---

**🤖 自動実装開始方法**: このIssueに `codex` ラベルが追加されると、GitHub ActionsによりCodex CLIが自動実装を開始します。

**⚠️ 注意**: 自動実装後は必ずコードレビューを行い、品質とセキュリティを確認してからマージしてください。
