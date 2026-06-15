# Workflow — QA + Handoff (PEPPER ST.)

- **Type:** project coordination workflow
- **Owner:** `qa-review-agent`, then `handoff-agent`.
- **Related:** `docs/templates/qa-report-template.md`,
  `docs/templates/slice-handoff-template.md`, `docs/agents/agent-boundaries.md`.

## Entry condition

A slice implementation is complete and its tests have been run.

## Steps

1. **QA** — `qa-review-agent` checks acceptance criteria **and** boundaries (read-only
   `ai.*`, PII masking in UI + logs, tenant scoping, no forbidden tables, no transcript
   duplication, explicit entitlements), reviews tests, and emits a `qa-report` with a
   **PASS / FAIL** verdict + specific reasons.
2. If **FAIL** → return to `fullstack-builder-agent` within the **same slice scope**.
3. If **PASS** → `handoff-agent` fills `slice-handoff-template.md`.
4. Update living docs: the relevant workflow/ADR, `docs/changelog/technical-decision-log.md`,
   and a handoff entry.

## Approval gate

**Gate 4** — a slice is accepted only on **QA PASS** *and* updated docs/handoff.

## Validation

PASS verdict recorded; docs + decision log updated; risks captured.

## Handoff output

The QA report **plus** the slice handoff (files, tests, risks, next allowed step).

## Stop conditions

- Missing tests or unmet acceptance criteria → **QA FAIL**; do not hand off.
- Any unresolved boundary violation → **stop**, escalate to the orchestrator.
