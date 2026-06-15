# Workflow — Phase 1 Slice (PEPPER ST.)

- **Type:** project coordination workflow
- **Owner:** `webapp-orchestrator` routes; `fullstack-builder-agent` implements.
- **Related:** `docs/phases/phase-1-implementation-plan.md`,
  `docs/agents/agent-boundaries.md`, templates in `docs/templates/`.

## Entry condition

**Gate 0 PASSED**, and the slice's prerequisite gate is satisfied (e.g. Slice 3 needs
**Gate 2**). A slice plan (`docs/templates/slice-plan-template.md`) exists with clear
scope and acceptance criteria.

## Steps

1. **Plan** — orchestrator + the lead agent fill `slice-plan-template.md`
   (goal, in/out scope, files, tests, gate, handoff) and confirm `agent-boundaries.md`.
2. **Build** — `fullstack-builder-agent` implements **one** vertical slice; TDD where
   practical; honors all boundaries (read-only `ai.*`, no forbidden tables, tenant
   scoping, masking, explicit entitlements).
3. **Test** — run **Vitest** (unit) + **Playwright** (UI) as applicable.
4. **Review** — `qa-review-agent` produces a `qa-report` (**PASS / FAIL**).
5. **Handoff** — `handoff-agent` fills `slice-handoff-template.md`; update the relevant
   docs/workflow/ADR and `docs/changelog/technical-decision-log.md`.

## Approval gate

**Gate 4** (per-slice QA + docs/handoff). Migration/seed slices also require **Gate 2**.

## Validation

Acceptance criteria met; tests green; boundaries upheld; living docs updated.

## Handoff output

A filled slice handoff (files, tests, risks, next slice) **plus** the QA report.

## Stop conditions

- QA **FAIL** → fix within the slice scope or split; do not proceed.
- Scope creep beyond one slice → **stop**, re-plan.
- Any boundary conflict (e.g. the slice seems to need a forbidden table or a write to
  `ai.*`) → **stop**, escalate to the orchestrator.
