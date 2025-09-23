# Codex のアップデート方法
npm install -g @openai/codex@latest
※グローバルインストール

# Web検索ありで起動
codex -m gpt-5-codex --yolo -c model_reasoning_effort="high" --search "$@"

# 指示の出し方
prompts/Instructions.md を読んで、そこに書いてある制約条件を守りながら指示を実行してください。英語で思考して、ドキュメントも英語で作成し、回答は日本語でお願いします。
--------------------------------
prompts/Instructions1.md を読んで、そこに書いてある指示を実行してください。
--------------------------------
gh auth switch --user smorce
してから、今の変更をコミットしてリポジトリ(https://github.com/smorce/CodexCLI)にPUSHしてください。ブランチも適切に対応して必要に応じてマージしてください。

あと、長文は右クリックで貼り付けできた。


# SOW の作成をしたらNEXTステップに進む前に、その都度確認を入れてもらうように AGENTS.md で指示している

go on で指示する。

# Codex × DeepResearch

https://x.com/hirokaji_/status/1960708835892674769?s=12
“ローカルで Deep Research→資料化まで一直線”を、Codex CLI v0.24.0 の新機能（Web検索・画像ドラッグ&ドロップ・キューイング）前提で一発起動できるコピペ用プロンプトに落とし込みました。最初に最小セットアップ→本体プロンプト→非対話（定期実行）用の順で置いておきます。