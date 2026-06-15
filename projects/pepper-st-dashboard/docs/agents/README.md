# PEPPER ST. — Agent Coordination (project-scoped)

How the PEPPER ST. dashboard build uses the repository's **global** AI agent team.

> **Global agents are generic and reusable.** This folder adds **project-scoped**
> coordination only — boundaries, slice ownership, workflows, and templates for the
> PEPPER ST. build. It must **never** duplicate or modify the global agents in
> `.claude/agents/`.

## Runnable team (global — do NOT duplicate)

These live at the repo root in `.claude/agents/` and are the actual runnable agents.
PEPPER ST. uses them **as-is**:

| Role on this project | Global agent file | Used for |
|---|---|---|
| Orchestrator | `.claude/agents/webapp-orchestrator.md` | Routing, gatekeeping, next-step decisions |
| Product Discovery | `.claude/agents/product-discovery-agent.md` | Clarify users / flows / success criteria |
| Solution Architect | `.claude/agents/solution-architect-agent.md` | Boundaries, data ownership, tenancy, migration review |
| Prototype | `.claude/agents/prototype-agent.md` | Disposable UI/UX de-risking (on request) |
| Fullstack Builder | `.claude/agents/fullstack-builder-agent.md` | Implement one vertical slice |
| QA Review | `.claude/agents/qa-review-agent.md` | PASS / FAIL review against acceptance criteria |
| Handoff | `.claude/agents/handoff-agent.md` | Summarize work, files, tests, risks, next steps |

There are **no** project-local copies of these agents — by design.

## Slice ownership (Phase 1)

Per `docs/phases/phase-1-implementation-plan.md`:

| Slice | Lead global agent | Support |
|---|---|---|
| 0 — Subagent readiness | `webapp-orchestrator` | `solution-architect-agent` |
| 1 — App shell + UI foundation | `fullstack-builder-agent` | `prototype-agent` |
| 2 — Drizzle schema / migration proposal | `solution-architect-agent` | `fullstack-builder-agent` |
| 3 — Seed + tenant context | `fullstack-builder-agent` | — |
| 4 — Agno transcript parser/service | `fullstack-builder-agent` | `qa-review-agent` |
| 5 — Chat Monitor | `fullstack-builder-agent` | `qa-review-agent` |
| 6 — Basic analytics | `fullstack-builder-agent` | `qa-review-agent` |
| 7 — Demo hardening | `fullstack-builder-agent` | `qa-review-agent`, `handoff-agent` |

The `webapp-orchestrator` sequences every slice and enforces the gates.

## Project-scoped docs in this set

- `agent-boundaries.md` — hard boundaries + forbidden actions all agents honor here.
- `../workflows/gate-0-subagent-readiness.md`
- `../workflows/phase-1-slice-workflow.md`
- `../workflows/schema-migration-review-workflow.md`
- `../workflows/qa-handoff-workflow.md`
- `../templates/slice-plan-template.md`
- `../templates/slice-handoff-template.md`
- `../templates/qa-report-template.md`
- `../templates/migration-proposal-template.md`

## Skills (parked)

The global `.claude/skills/` directory contains scaffolded skill folders that are
**empty**, and **no project skills are defined** for PEPPER ST. Skills are **optional**
and **not required** for the agent team to run, so they do **not** block Gate 0. Revisit
only if a stable skill convention is confirmed — do not add project skills now.

## Golden rule

Before any slice, read `AGENTS.md`, `CLAUDE.md`, this project's `CONTEXT.md`, and
`agent-boundaries.md`. **Global agents stay generic; project specifics live here.**
