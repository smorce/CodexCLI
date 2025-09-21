# Research Query & Logging Plan (2025-09-21)

## Objectives
- Surface Microsoft Copilot Studio agent development guidance (published between 2025-08-22 and 2025-09-21).
- Focus on actionable best practices for mid-level engineers implementing Copilot Studio agents.
- Prioritize official Microsoft sources, product updates, and corroborated industry analyses.

## Keyword Strategy
- Core: "Microsoft Copilot Studio agent", "Copilot Studio bot", "Copilot Studio best practices", "Copilot Studio agent patterns".
- Historical terms: "Power Virtual Agents", "Copilot Studio custom connectors", "Copilot Studio orchestration".
- Japanese variants: "Copilot Studio エージェント 開発", "Copilot Studio ベストプラクティス", "Power 仮想エージェント".
- Feature focus: "Copilot Studio plugins", "Copilot Studio Actions", "Microsoft 365 Copilot extensibility", "Copilot Studio security".
- Exclusions: deprecated "Power Apps" only content, unrelated "GitHub Copilot" hits, low-signal marketing pieces.

## Source Prioritization
1. Microsoft Learn, documentation, roadmap, release notes, Tech Community blogs.
2. Ignite/Build session recaps, product team videos within timeframe.
3. Reputable tech media (ZDNet, The Verge) covering product updates; cross-check with Microsoft sources.
4. Community posts (Stack Overflow, GitHub) only for corroborating implementation nuances.

## Logging Approach
- Store hit metadata JSONL in `research_out/2025-09-21/data/sources.jsonl` with fields: title, url, published, accessed_of, summary, source_type, cred_score, notes.
- Archive significant pages under `research_out/2025-09-21/data/raw/` using hashed filenames.
- Maintain research command log in `research_out/2025-09-21/logs/commands.log` (append mode).
- Record analysis steps and synthesis notes in `research_out/2025-09-21/logs/analysis-notes.md`.
- Annotate any figure generation scripts or notebooks in `logs/` with reproducibility instructions.

## Next Steps
1. Execute staged web searches (EN then JA) using web.run; log each query and timestamp.
2. Append findings to `sources.jsonl` as they are validated.
3. Begin fact table scaffolding once ?5 high-confidence sources collected.
