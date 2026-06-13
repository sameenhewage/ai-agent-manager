# Skill ↔ Agent Alignment

How the installed Matt Pocock skills map onto this repo's custom AI agents
(`.claude/agents/`) and workflows (`.claude/workflows/`). The skills themselves
live in `.claude/skills/`.

## By agent

| Agent | Skills it draws on |
| ----- | ------------------ |
| WebApp Orchestrator | `zoom-out`; routes work into `to-prd` / `to-issues` |
| Product Discovery Agent | `grill-me`, `grill-with-docs`, `to-prd` |
| Solution Architect Agent | `improve-codebase-architecture`, `zoom-out`, `grill-with-docs` (for ADRs later) |
| Prototype Agent | `prototype` |
| Fullstack Builder Agent | `tdd`, `to-issues` |
| QA Review Agent | `review`, `diagnose` |
| Handoff Agent | `handoff` |

## By workflow

| Workflow | Skill sequence |
| -------- | -------------- |
| `new-feature-workflow` | `grill-me` -> `to-prd` -> `to-issues` -> `prototype` (if useful) -> `tdd` -> `review` -> `handoff` |
| `bugfix-workflow` | `diagnose` -> `tdd` -> `review` -> `handoff` |
| `review-workflow` | `review` |

## Cross-cutting / repo setup

| Skill | Purpose |
| ----- | ------- |
| `setup-matt-pocock-skills` | Configures issue tracker, triage labels, and domain docs (this setup). |
| `git-guardrails-claude-code` | Blocks dangerous git commands via Claude Code hooks. |
| `setup-pre-commit` | Husky + lint-staged pre-commit hooks (only once a JS/TS toolchain exists). |

## Notes

- Skills are invoked inside Claude Code (e.g. `/tdd`, `/review`). They
  complement — not replace — the agent definitions and workflows already in
  this repo.
- `git-guardrails-claude-code` and `setup-pre-commit` require their own setup
  steps before they take effect; installing the skill only adds the
  instructions.
