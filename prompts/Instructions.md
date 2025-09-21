## 0) 初期化
- このリポ/フォルダ直下に ./research_out/{date}/ を作成。サブ構成:
  - data/  : 検索結果JSON, メタ情報, 一時HTML/テキスト
  - figs/  : 図表PNG/SVG, 解析した画像
  - imgs/  : ユーザーがD&Dした画像をコピー(存在すれば)
  - logs/  : 実行ログ, コマンド履歴
  - report/: 最終レポート (Markdown), スライド (PPTX), 付録
- 既存なら追記モード。git管理下なら新規ブランチ `feat/research-{date}` を切る。
- Python仮想環境 or Nodeツールが必要なら自動生成(要承認)。依存例:
  - python: requests, beautifulsoup4, pandas, matplotlib, python-pptx, markdown-it-py
  - node  : playwright(必要時), markdown-table など

## 1) ユーザー入力確認
- {TOPIC}: 調査テーマ（例: "RAGの最新評価手法 2025"）
- {SCOPE_DAYS}: 何日分さかのぼるか（既定: 30）
- {NEED_SLIDES}: PPTXも必要か（yes/no, 既定: yes）
- {AUDIENCE}: 想定読者（例: "経営層/実装エンジニア/研究者"）
- {DEPTH}: 粒度（lite/standard/deep, 既定: standard）

## 2) 調査計画（プランニング）
- クエリ設計: 用語正規化, 同義語, 和英併記, 除外語を定義。
- 情報源レイヤ: 公式(標準/仕様/ベンダーDoc)、論文(arXiv等)、信頼メディア、技術ブログ、GitHub/Release Note、カンファ発表。
- 取得戦略: 直近 {SCOPE_DAYS} 日を強調。一次情報を優先。各ヒットはタイトル/URL/発行日/要点/信頼度をメタ化。
- 反証チェック: 重要主張は2+独立ソースでクロスチェック。矛盾は併記。
- 出力設計: 
  - レポート: Executive Summary → Key Findings → What Changed → Risks & Open Issues →
    Actionable Next Steps（読者別）→ 参考文献（出典URL/日付）
  - 図表: 時系列要約, エコシステム相関, 比較表
  - スライド: 15枚以内、各スライド1メッセージ1結論。図表はreportから再利用。

## 3) 収集（Web検索ツールを使用）
- built-in Web検索ツールで、クエリ束を実行。
- 各ヒットは data/sources.json に JSONLで保存: 
  { "title","url","published","snippet","source_type","cred_score","notes" }
- 重要URLは必要に応じてHTTP取得→本文を data/raw/{hash}.html/.txt に保存し要点抽出。
- 画像がD&D/./input_imagesにあれば OCR/要素抽出→figs/ に解析結果を保存。

## 4) 要約・検証・構造化
- 収集結果を正規化し、重複除去・日付整合・主張単位でファクト表を作成（CSV）。
- 重要主張は最低2ソースで裏取り。根拠→脚注番号でMarkdownに自動挿入。
- 図表生成（matplotlib等）: 
  - タイムライン, 競合比較(表), エコシステム相関(簡易グラフ)
- 変更履歴（What Changed in last {SCOPE_DAYS}d）を差分で提示。

## 5) レポート生成（Markdown）
- report/{date}-{slug}.md を生成。構成:
  - タイトル（{TOPIC} / 日付）
  - Executive Summary（3〜7行）
  - Key Findings（箇条書き 5〜12個, 各1行根拠脚注）
  - Deep Dive（小見出し別に本文。図表は相対パス参照）
  - Risks & Open Issues（不確実性/未解決点）
  - Recommendations（{AUDIENCE} 別に実行手順/優先度/所要コストの目安）
  - References（URL, 発行日, アクセス日）

## 6) スライド生成（任意）
- {NEED_SLIDES} = yes のとき、python-pptxで report から PPTX を作成:
  - タイトル, サマリ, 変更点, 比較, 図表, 次アクション の計10〜15枚
  - 16:9, 文字大きめ, 余白広め, 脚注に出典URL短縮
- 出力: report/{date}-{slug}.pptx

## 7) 納品 & ログ
- 生成物一覧を http://README.md に追記。git管理ならコミット+ブランチpush提案。
- 実行ログ/依存インストール履歴を logs/ に保存。

## 8) 実行
- 以上を自動オーケストレーション。各段階で安全に承認を取りつつ進める。
- 途中で追加画像がD&Dされたら、該当セクションに反映しレポート/スライド更新。

---

### 指示

<入力受付>
- TOPIC="Microsoft Copilot Studioでエージェントを開発する方法とベストプラクティス"
- SCOPE_DAYS=30
- NEED_SLIDES=yes
- AUDIENCE="中級エンジニア"
- DEPTH="standard"
</入力受付>

### 制約条件

- まず不足があれば質問してから開始してください。
- 作業開始前にSOWを作成してから実行してください。