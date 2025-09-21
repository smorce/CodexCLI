# Statement of Work: Microsoft Copilot Studio Agent Research

- **Date**: 2025-09-21
- **Prepared by**: Codex (AI assistant)
- **Stakeholder**: User (Principal Architect)

## 1. Background & Objectives
- Investigate current (<=30 days) guidance on developing agents with Microsoft Copilot Studio.
- Extract enterprise-ready best practices tailored to mid-level engineers.
- Produce actionable recommendations aligned with specification-driven, TDD/Tidy First philosophy.

## 2. Deliverables
- Markdown research report at `research_out/2025-09-21/report/2025-09-21-microsoft-copilot-studio-agent-research.md`.
- Supporting data artifacts under `research_out/2025-09-21/data/`, `research_out/2025-09-21/figs/`, `research_out/2025-09-21/imgs/`, `research_out/2025-09-21/logs/` as required by findings.
- (If feasible) CSV fact table summarizing validated claims in `research_out/2025-09-21/data/facts.csv`.
- PPTX slide deck (<=15 slides) at `research_out/2025-09-21/report/2025-09-21-microsoft-copilot-studio-agent-research.pptx`.
- Update `README.md` with generated asset index if instructed by process.

## 3. Scope of Work
- **In Scope**
  - Plan and execute structured web research using Codex web tooling.
  - Prioritize primary sources: Microsoft official docs/blogs, release notes, trusted tech media.
  - Capture metadata for each source (title, URL, publication date, confidence notes).
  - Validate key claims with >=2 independent sources when available.
  - Summaries targeted to mid-level engineers with practical implementation focus.
- **Out of Scope**
  - Hands-on development or code deployment inside Copilot Studio.
  - Procurement, licensing, or cost negotiation activities.
  - Non-public or paywalled resources requiring credentials beyond provided access.

## 4. Approach & Methodology
1. Confirm requirements and constraints from `prompts/Instructions.md` and user briefing.
2. Stand up research workspace directories (`research_out/2025-09-21/{data,figs,imgs,logs,report}`) in append-safe mode.
3. Design query strategy (EN/JA keywords, synonyms, exclusion terms) emphasizing changes within last 30 days.
4. Execute web searches; store raw hit metadata as JSONL in `research_out/2025-09-21/data/sources.jsonl`; archive notable pages under `research_out/2025-09-21/data/raw/`.
5. Normalize findings, build fact table, highlight recent changes, and draft narrative sections per mandated outline.
6. Generate figures/tables if data supports them; embed via relative paths.
7. Produce Markdown report followed by slide deck distilled from the report.
8. Summarize outputs, verification steps, and next actions to stakeholder.

## 5. Timeline & Milestones (Target)
- SOW approval: 2025-09-21.
- Web research & data capture: 2025-09-21.
- Analysis & synthesis: 2025-09-21.
- Report & slide generation: 2025-09-21.
- Final review & handoff: 2025-09-21.

## 6. Dependencies & Assumptions
- Reliable internet access for Microsoft documentation and reputable sources.
- Ability to run Python tooling if visualization is required (packages may need installation).
- No conflicting tasks modifying `research_out/2025-09-21/` during execution.

## 7. Risks & Mitigations
- **Rapid product updates**: Mitigate by cross-checking with official release notes and timestamps.
- **Source credibility variance**: Emphasize official Microsoft content; assign confidence scores.
- **Time constraints**: Maintain lightweight but complete documentation; defer non-critical enhancements.

## 8. Acceptance Criteria
- All deliverables produced in specified locations with traceable sources.
- Recommendations clearly actionable for mid-level engineers and tied to evidence.
- Slides and report consistent in messaging.
- Research log captures commands and decisions for auditability.

## 9. Approval
- [ ] Approved by User
- [ ] Not Approved (provide feedback)
