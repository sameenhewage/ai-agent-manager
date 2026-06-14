# AGENTS.md

Operating rules for AI agents working in this repository.

This file is the single source of truth for **how** AI agents behave here. Every
agent and every AI-assisted session must follow these rules. When in doubt,
re-read this file before acting.

---

## Core principles

- **Context before code.** Always understand the current task, the affected
  area, and existing conventions before making any change.
- **No random coding.** Do not write, refactor, or "improve" code that is not
  part of an explicit, agreed task.
- **Ask when unclear.** If requirements are ambiguous, ask clarifying questions
  before implementing. A short question now beats a wrong implementation later.
- **Small, reversible changes.** Prefer the smallest change that fully solves
  the task. Large changes must be split.
- **Vertical slices.** Deliver complete, working slices (UI + API + validation +
  data + tests when relevant) rather than horizontal half-features.
- **Explain assumptions.** State any assumption you make before acting on it.

---

## What every agent MUST do

1. **Read context first**
   - Read `AGENTS.md` (this file) and `CLAUDE.md`.
   - Read the relevant task brief, issue, or PRD.
   - Inspect the existing code in the affected area.

2. **Work in vertical slices**
   - One slice = one thin, end-to-end piece of value that can be tested.
   - Keep each slice independently reviewable.

3. **Keep changes small**
   - If a task grows beyond a small slice, stop and split it.
   - Avoid unrelated edits in the same change.

4. **Report after every task**
   Every completed task must end with:
   - **Files changed** — explicit list of created/modified/deleted files.
   - **Tests run** — what was run and the result (or why none were run).
   - **Risks** — known risks, edge cases, or follow-ups.

5. **Preserve conventions**
   - Match existing structure, naming, and style.
   - Do not introduce new patterns, libraries, or tools without approval.

---

## What every agent MUST NOT do

- **Do not modify architecture without explicit approval.** Boundaries, data
  ownership, auth model, and tech stack are not changed casually.
- **Do not create product or architecture docs at the repo root.**
  Root `docs/` is for AI team / workflow docs only — never create root-level
  `docs/product/` or root-level `docs/adr/`. A project's product docs, ADRs, and
  `CONTEXT.md` live inside that project under `projects/<project-name>/`
  (see "Documentation layout" under Agent skills).
- **Do not implement features without a clear issue or task.**
- **Do not install packages or add dependencies** without explicit approval.
- **Do not invent requirements.** If it is not specified, ask.
- **Do not leave the codebase in a broken state.**

---

## Project bootstrap rule

Every generated project under `projects/<project-name>/` must start from a
required documentation skeleton, created **before any implementation begins**.
These files must exist inside the project folder:

- `projects/<project-name>/CONTEXT.md`
- `projects/<project-name>/README.md`
- `projects/<project-name>/docs/product/00-product-vision.md`
- `projects/<project-name>/docs/product/01-users-and-roles.md`
- `projects/<project-name>/docs/product/02-core-flows.md`
- `projects/<project-name>/docs/product/03-feature-scope.md`
- `projects/<project-name>/docs/product/04-prd-first-slice.md`
- `projects/<project-name>/docs/adr/0001-technical-baseline.md`

Rules:

- **All skeleton files live inside `projects/<project-name>/`.** Never create
  root-level `docs/product/` or root-level `docs/adr/`.
- **No implementation may begin until this skeleton exists.** The WebApp
  Orchestrator blocks build work until it is in place.
- Beyond the skeleton, further ADRs and glossary terms are added later, inside
  the project, as decisions get resolved.

---

## Workflow at a glance

```
clarify -> define scope -> shared context -> PRD (if needed)
        -> vertical slices -> prototype (if useful)
        -> implement one slice -> test (TDD where practical)
        -> review -> handoff
```

The **WebApp Orchestrator** decides the next step and routes work. No agent
jumps straight to implementation without scope and context.

---

## Agents in this repository

| Agent | Purpose |
|-------|---------|
| WebApp Orchestrator | Leads the workflow, decides next step, routes work, blocks random implementation. |
| Product Discovery Agent | Clarifies business/product needs, users, workflows, success criteria. |
| Solution Architect Agent | Thinks about boundaries, data ownership, auth, tenancy, scalability. |
| Prototype Agent | Builds disposable prototypes only when requested. |
| Fullstack Builder Agent | Implements one vertical slice at a time. |
| QA Review Agent | Reviews changes, outputs PASS / FAIL with reasons. |
| Handoff Agent | Summarizes work, files, tests, risks, next steps. |

Full definitions: see `.claude/agents/`.
Workflows: see `.claude/workflows/`.
Templates: see `.claude/templates/`.
Team docs: see `docs/agents/`.

---

## Definition of done (per task)

- Scope was clear and agreed before coding.
- Change is a small vertical slice.
- Tests run (or a clear reason why not).
- Report provided: files changed, tests run, risks.
- No unapproved architecture or dependency changes.

---

## Agent skills

Matt Pocock's skills are installed under `.claude/skills/`. They read repo
config from the files below.

### Issue tracker

Issues and PRDs are tracked in **GitHub Issues** via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles map 1:1 to label strings (`needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See
`docs/agents/triage-labels.md`.

### Domain docs

**Multi-project** layout — this is a master-factory repo. Each project owns its
own `CONTEXT.md`, `docs/product/`, and `docs/adr/` under
`projects/<project-name>/`; root `docs/` holds shared AI team docs only. See
`docs/agents/domain.md`.

### Skill ↔ agent alignment

How installed skills map to our agents and workflows. See
`docs/agents/skill-alignment.md`.

### Documentation layout

This repository is an **AI agent manager / master-factory** repo: it creates and
manages multiple separate web app projects under `projects/`.

- **Root `docs/` is for AI agent / team documentation only** (e.g.
  `docs/agents/`). It is shared across all projects.
- **Never create root-level `docs/product/` or root-level `docs/adr/`.**
- **Each generated project keeps its own docs**, scoped to that project:
  - `projects/<project-name>/docs/product/` — product vision, scope, PRDs
  - `projects/<project-name>/docs/adr/` — that project's architecture decisions
  - `projects/<project-name>/CONTEXT.md` — that project's domain context (part of the required bootstrap skeleton)
- Shared team assets (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `docs/agents/`) stay
  at the repo root and are never copied into a project.
