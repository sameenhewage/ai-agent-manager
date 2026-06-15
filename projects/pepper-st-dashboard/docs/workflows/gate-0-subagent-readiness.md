# Workflow — Gate 0: Subagent Readiness (PEPPER ST.)

- **Type:** project coordination workflow (not a product/domain workflow)
- **Owner:** `webapp-orchestrator` (with `solution-architect-agent`)
- **Related:** `docs/agents/README.md`, `docs/agents/agent-boundaries.md`,
  `docs/phases/phase-1-implementation-plan.md`

## Entry condition

Runs **before any** Phase 1 implementation slice. **No app code** may start until this
gate passes.

## Steps

1. Read `AGENTS.md`, `CLAUDE.md`, and this project's `CONTEXT.md`, `README.md`,
   `docs/phases/phase-1-implementation-plan.md`, and `docs/agents/agent-boundaries.md`.
2. Verify the **global** agents exist and are usable in `.claude/agents/`:
   `webapp-orchestrator`, `product-discovery-agent`, `solution-architect-agent`,
   `prototype-agent`, `fullstack-builder-agent`, `qa-review-agent`, `handoff-agent`.
3. Verify project-scoped coordination exists: `docs/agents/`, the coordination
   workflows in `docs/workflows/`, and `docs/templates/`.
4. Confirm docs reference the global agents by their **exact** filenames and that
   **no duplicate** global agents were created.
5. Record skills status (global `.claude/skills/` empty → **parked**; optional,
   non-blocking).

## Approval gate

**Gate 0** — readiness confirmed. Records a **PASS / FAIL** verdict in the handoff and
the decision log.

## Validation

- 7 global agents present & well-formed — ✓/✗
- Project boundaries / workflows / templates present — ✓/✗
- References correct, **no duplicates** — ✓/✗
- Skills status noted — ✓/✗

## Handoff output

Gate 0 verdict (PASS/FAIL), what was created, the skills decision, and the next
allowed step.

## Stop conditions

- If global agents are missing or broken → **FAIL**; propose restoring them; **stop**.
- On **PASS**, the next allowed step is **Slice 1 (app shell)**. **Do not start
  Slice 1 within the Gate 0 task.**
