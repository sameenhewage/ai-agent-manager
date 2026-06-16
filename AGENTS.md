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
   - **When the work touches a project under `projects/<name>/`, read that
     project's `CONTEXT.md` first** — it carries project-specific contracts that
     *extend* (never override) the global engineering rules below.
   - Inspect the existing code in the affected area.

2. **Work in vertical slices**
   - One slice = one thin, end-to-end piece of value that can be tested.
   - Keep each slice independently reviewable.

3. **Keep changes small**
   - If a task grows beyond a small slice, stop and split it.
   - Avoid unrelated edits in the same change.

4. **Report after every task**
   Every completed task must end with the **Final PASS Report Standard**
   (Engineering rule 11 below): requirement understood, root cause (for fixes),
   files read, files changed, tests added/updated, proof the tests failed before
   the fix (or an honest reason they could not), runtime/browser/network proof
   where relevant, security proof where relevant, what was **not** changed,
   remaining risks, and the next recommended step.

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
- **Do not mask a bug with a defensive patch before the root cause is proven**
  (see Engineering rule 3).
- **Do not return / claim PASS** on "tests pass", "build green", or "I added a
  guard" alone — PASS requires user-visible/runtime truth (Engineering rule 1).

---

## Engineering rules (global, mandatory)

These apply to **all** work — features, bugfixes, UI, API, DB, and agent
workflows — across **every** project. They are **generic** engineering standards;
project-specific contracts live in each project's `CONTEXT.md` (rule 12). No task
is **PASS** unless these gates are satisfied. Every agent and workflow inherits
these rules by reading this file first.

### 1. Product Truth Gate
Validate the real product/user requirement **before** coding. A feature is **not**
done because tests pass, types pass, the build passes, the API responds, docs were
updated, or a guard/cache/de-dupe was added. It is done **only** when:
- the browser / runtime / **user-visible behavior** matches the actual requirement,
- the **data source of truth** is correct, and
- the end-to-end **workflow behaves correctly**.

Before coding, write the acceptance truth in plain language:
**"User expects X. Current system does Y. Done means Z."**

### 2. Root Cause Gate
Before fixing any bug, **prove** the root cause. Every bugfix must report:
1. current flow, 2. the **exact owner** of the behavior, 3. **why** the bug
happens, 4. whether it happens in **dev, production, or both**, 5. the **smallest
correct root fix**, 6. what was deliberately **not** changed. Never patch a
symptom first.

### 3. No Symptom Masking
Do not hide lifecycle, data-flow, state, or architecture bugs with broad
defensive patches **unless the root cause is first proven**. Not acceptable as a
**primary** fix: global request de-dupe, generic caches, broad guards, retries,
timeouts, silent fallbacks, extra loaders, duplicate state, extra sync jobs, new
tables. These are allowed **only** as supporting safety **after** the root cause
is fixed and the choice is justified.

### 4. Ownership
Every behavior has **one** clear owner — one owner loads a list, one selects the
default item, one loads the selected detail, one owns pagination, one owns sync,
one owns source-of-truth mapping. If two effects/services/components can trigger
the same action, **resolve ownership**; do not mask the duplicate outcome.

### 5. TDD Means Business Truth
Tests protect the **business contract**, not the current implementation.
- **Bad:** "current table has 4 rows → UI shows 4"; "the fetch was duplicated →
  de-dupe hides it"; "the component renders → test passes".
- **Good:** "8 valid source sessions → dashboard maps all 8 **or** explains safe
  exclusions"; "56 messages, page size 20 → initial load returns the latest 20,
  scroll-up loads the older 20"; "a filter change updates **exactly** the right
  surface, not the whole app".

Tests must **fail before** implementation where practical. If a failing test
cannot be produced because the behavior already works, **say so honestly** and
provide **runtime** proof instead.

### 6. Runtime Proof Gate
For UI/network/runtime behavior, unit tests are **not enough**. Provide the proof
the feature warrants: browser **Network tab** for API behavior; **DOM/screenshot**
for visual behavior; **console** check for frontend work; **dev *and* production**
build checks where lifecycle/build behavior can differ; **database verifier** for
DB/data-source work; **before/after counts** for analytics/data work; **security**
proof for API DTOs. **"Tests pass" alone is not PASS.**

### 7. Source-of-Truth Gate
Before any data feature, identify: which **table/API/service owns** the data;
which tables are **read-only**; which may be **written**; whether data is
**duplicated or indexed**; how **stale** data is detected; how **missing** data is
surfaced. Do **not** create duplicate tables or duplicate state without an
approved architecture decision (ADR).

### 8. Security / Safe DTO Gate
Browser/API responses must not expose raw sensitive/internal identifiers unless
explicitly approved. **Forbidden by default:** raw phone numbers, raw user IDs,
raw external contact IDs, raw vendor/session IDs, raw DB internals, raw transcript
source JSON, and raw `session_data`/`runs` not required by the UI. **Expose safe
DTOs only.**

### 9. No Over-Engineering
Use the **smallest correct fix**. Do not add new libraries, architecture, tables,
global abstractions, queues, caches, generic frameworks, or broad wrappers unless
the problem requires it **and** the decision is documented. If a simple ownership
fix solves it, do that.

### 10. Documentation / Decision Log Gate
Any meaningful behavior, architecture, data-source, workflow, or UX decision
updates the right level: root `AGENTS.md` / `CLAUDE.md` for global agent behavior;
project `CONTEXT.md` / project docs for project-specific rules; an **ADR /
technical-decision-log** for architecture decisions; workflow/template docs when
the process changes. **Never leave stale, contradictory docs.**

### 11. Final PASS Report Standard
Every final report includes: 1. requirement understood, 2. root cause, 3. files
read, 4. files changed, 5. tests added/updated, 6. proof the tests **failed before**
the fix (or an honest reason they could not), 7. runtime/browser/network proof
where relevant, 8. security proof where relevant, 9. what was **not** changed,
10. remaining risks, 11. next recommended step.
**Forbidden PASS:** "all tests pass" only; "build green" only; "I added a guard"
only; "looks good" without runtime proof.

### 12. Project-specific contracts live in the project
These global files hold **generic** engineering rules only. Project-specific
contracts (e.g. PEPPER ST. Chat Monitor WhatsApp behavior, realtime/sync rules)
live in that project's `CONTEXT.md` / project docs — **read it before working in a
project.** Keep at most a one-line illustrative example in the global files.

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

- Scope was clear and agreed before coding; the acceptance truth was stated
  ("User expects X / system does Y / done means Z" — Engineering rule 1).
- Change is a small vertical slice; for a bugfix, the **root cause was proven**
  before the fix (rule 2) and no symptom was masked (rule 3).
- Tests protect the **business contract** and fail-first where practical (rule 5).
- **Runtime/browser/network proof** provided where behavior is user-visible
  (rule 6); **safe DTOs** verified for any API change (rule 8).
- Report follows the **Final PASS Report Standard** (rule 11).
- No unapproved architecture, dependency, or duplicate-state changes (rules 7, 9).
- Relevant docs updated; nothing left stale or contradictory (rule 10).

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
