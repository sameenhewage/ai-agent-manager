# CLAUDE.md

Instructions for Claude Code (and any Claude-based agent) working in this
repository.

> **Read `AGENTS.md` first.** It defines the operating rules for all AI agents.
> This file adds Claude-specific guidance on top of those rules.

---

## Before you do anything

1. **Read `AGENTS.md`.** Follow it without exception.
2. **Understand the current task.** Find the issue, task brief, or PRD that
   authorizes the work. If there is none, stop and ask.
3. **Inspect the affected code** before editing. Know what exists and why.

---

## Rules for Claude Code

- **Understand the task before editing.** No edits without a clear goal and a
  defined scope.
- **Do not create product or ADR docs unless explicitly asked.** Specifically,
  do not create `docs/product/` or `docs/adr/` on your own.
- **Do not implement features without a clear issue or task.** If the request
  is vague, ask clarifying questions first.
- **Prefer simple, maintainable solutions.** Choose the smallest change that
  fully solves the problem. Avoid clever abstractions and premature
  generalization.
- **Explain assumptions before acting.** If you must assume something to
  proceed, state it clearly and proceed only if low-risk; otherwise ask.
- **Preserve existing project conventions.** Match naming, structure, style,
  and tooling already in use. Do not introduce new dependencies or patterns
  without explicit approval.

---

## Engineering rules (global, mandatory)

**`AGENTS.md` → "Engineering rules (global, mandatory)" is the canonical list.**
They are generic and apply to every project, feature, bugfix, UI, API, and DB
task. Do not restate or fork them here — read them there. In short:

1. **Product Truth Gate** — done = browser/runtime behavior + data source of truth
   + workflow are correct; *not* "tests/types/build/API/docs pass" or "I added a
   guard/cache/de-dupe". Write "User expects X / system does Y / done means Z"
   before coding.
2. **Root Cause Gate** — prove the root cause (flow, owner, why, dev/prod,
   smallest fix, what was not changed) before any bugfix.
3. **No Symptom Masking** — no global de-dupe / cache / guard / retry / timeout /
   silent fallback / extra loader / duplicate state / new table as a *primary* fix.
4. **Ownership** — one clear owner per behavior; resolve duplicates, don't mask them.
5. **TDD = business truth** — test the contract, fail-first where practical.
6. **Runtime Proof Gate** — Network tab / DOM / console / dev+prod / DB verifier
   as the feature warrants; "tests pass" alone is not PASS.
7. **Source-of-Truth Gate** — know who owns/read-only/writable before data work.
8. **Security / Safe DTO Gate** — no raw phone / user / contact / session id /
   `runs` / `session_data` in responses; safe DTOs only.
9. **No Over-Engineering** — smallest correct fix; new libs/tables/abstractions
   need a documented decision.
10. **Docs / Decision-Log Gate** — update the right level; no stale contradictory docs.
11. **Final PASS Report Standard** — see "After every task" below.
12. **Project-specific contracts live in the project** — read the project's
    `CONTEXT.md` (e.g. `projects/pepper-st-dashboard/CONTEXT.md`) before working in it.

---

## How to respond

- Be concise and practical. Lead with the action or answer.
- When proposing changes, describe the plan briefly, then implement the
  agreed slice.
- Work in **vertical slices** and keep changes small and reversible.

## After every task

End with the **Final PASS Report Standard** (`AGENTS.md` Engineering rule 11; see
also `.claude/templates/implementation-summary-template.md`):

1. **Requirement understood** (the "X / Y / Z" acceptance truth).
2. **Root cause** (for fixes).
3. **Files read** and **files changed** (created / modified / deleted).
4. **Tests added/updated**, and **proof they failed before the fix** (or an honest
   reason they could not fail).
5. **Runtime / browser / network proof** where behavior is user-visible.
6. **Security proof** for any API/DTO change.
7. **What was NOT changed**, **remaining risks**, and the **next recommended step**.

**Forbidden PASS:** "all tests pass" only, "build green" only, "I added a guard"
only, or "looks good" without runtime proof.

---

## Agent skills

Matt Pocock's skills are installed in `.claude/skills/`. Their repo
configuration and how they map to our agents and workflows live in the
**`## Agent skills`** section of `AGENTS.md` and the files under `docs/agents/`.

---

## When unsure

Ask. A short clarifying question is always cheaper than rework. If you are
blocked, say what you need to proceed.
