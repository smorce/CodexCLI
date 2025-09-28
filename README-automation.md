---
prompts/Instructions1.md を読んで、そこに書いてある指示を実行してください。
---
を実行。

LLM に temp ディレクトリの Issue 本文を使いつつ Issue（codex ラベル付き）を作成してもらい、次に
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/trigger-issue-to-pr.ps1 -IssueNumber 5
```
を実行してもらう。
上記を実行するとワークフローが発火する。（一回ラベルを削除して貼り直さないと何故か発火しないため）。Webページから手動で実行することも可能(その場合は Issue 番号を手入力する)。

サブスク範囲内でCodexCLIを呼び出すことにも成功。
ただ、指示が悪いのかタスクリストをチェックするだけで実装してくれないので、Issue用の指示を修正しないといけない。 ← 今ココ

これで gpt-5-codex(hight) を使ったウォーターフォール型バイブコーディングはほぼできた。
- 全体アーキテクチャの設計
- 各マイクロサービスの詳細設計
- SOWの作成
- Issue本文の作成
までをCodexCLIが担当。
- trigger-issue-to-pr.ps1 で GitHub Actions のワークフローが稼働し
- サブスクの範囲内で gpt-5-codex(hight) が該当Issueの実装→プルリク作成する
フローになった。


==================
GitHub Actions 上で Codex を ChatGPT 認証で動かすフローを追加しました。secrets.CODEX_AUTH_JSON が存在する場合は preferred_auth_method = "chatgpt" を設定し、~/.codex/auth.json を復元して ChatGPT サブスク側の利用枠で実行します。なければ従来どおり API key モードで動作します。
- 使い方:
  - ローカルで codex --login → ~/.codex/auth.json を取得
  - リポジトリ Secrets に CODEX_AUTH_JSON として内容を保存
  - 既定モデルは OPENAI_MODEL で制御（リポジトリ Variables で上書き可能）

- gpt-5-codex は Chat Completions 非対応/権限外の可能性が高く 404 が出やすいです。サブスク認証でもモデル自体が非対応なら失敗します。OPENAI_MODEL は gpt-4o または gpt-4o-mini を推奨します。
- ChatGPT 認証での実行はサブスクの利用枠が消費されます。枠を超えるとリセットまで使えなくなる点に留意してください。




## GitHub Actions 発火スクリプト（Issue ラベル付け）

`issue-to-pr.yaml` を Issue のラベル付けで発火させるユーティリティを用意しています。

- スクリプト: `scripts/trigger-issue-to-pr.ps1`
- 前提: gh CLI にログイン済み（`gh auth status`）

### 使い方

1) Issue 番号で実行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/trigger-issue-to-pr.ps1 -IssueNumber 5
```

2) Issue URLで実行（番号を自動抽出）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/trigger-issue-to-pr.ps1 -IssueUrl https://github.com/<owner>/<repo>/issues/123
```

3) オプション

- `-Label <string>`: 付与するラベル名（デフォルト: `codex`）
- `-WorkflowPath <string>`: 監視対象のワークフロー（デフォルト: `.github/workflows/issue-to-pr.yaml`）
- `-TimeoutSec <int>`: 完了待ちのタイムアウト秒（デフォルト: 300）
- `-PollIntervalSec <int>`: ポーリング間隔秒（デフォルト: 5）
- `-OpenInBrowser`: 実行中/完了したランのURLをブラウザで開く

### 動作

- 指定ラベルを一度外してから付け直すことで `issues.labeled` を発火
- `.github/workflows/issue-to-pr.yaml` の最新ランを検出し、完了までポーリング
- 実行が完了すると、結論（success/failure）とランURLを出力
- 可能であれば Issue コメント増加や `codex/issue-<番号>` のPR存在を簡易チェック