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

## Scope: operate inside the active project

This is a master-factory repo, so project-facing skills must read and write
**inside the active project folder** (`projects/<project-name>/`), never at the
repo root:

- `grill-with-docs` — writes `projects/<project-name>/CONTEXT.md` and that
  project's `docs/adr/`.
- `to-prd` — PRDs and product docs belong to the project
  (`projects/<project-name>/docs/product/`).
- `to-issues` — issues go to the shared GitHub tracker, but titles/labels should
  name the project they belong to.
- `improve-codebase-architecture` — analyses and reports within the active
  project's code and ADRs only.
- `handoff` — summarises work for the active project, referencing that project's
  files and docs.

Only repo-setup skills (`setup-matt-pocock-skills`, `git-guardrails-claude-code`,
`setup-pre-commit`) and shared team docs operate at the repo root.

When a new project is bootstrapped, these skills populate its **required
skeleton** (`CONTEXT.md`, `README.md`, the `docs/product/` set, and
`docs/adr/0001-technical-baseline.md`) **inside** `projects/<project-name>/` —
never at the repo root. See the "Project bootstrap rule" in `AGENTS.md`.

## Notes

- Skills are invoked inside Claude Code (e.g. `/tdd`, `/review`). They
  complement — not replace — the agent definitions and workflows already in
  this repo.
- `git-guardrails-claude-code` and `setup-pre-commit` require their own setup
  steps before they take effect; installing the skill only adds the
  instructions.
