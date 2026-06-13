# Workflow Rules

Practical rules for how work moves through the AI team. These complement
`AGENTS.md` and the workflows in `.claude/workflows/`.

## Golden rules

1. **Clarify before coding.** No implementation without a clear goal and scope.
2. **Shared context first.** Read `AGENTS.md`, `CLAUDE.md`, and the task brief.
3. **PRD before big work.** Non-trivial features get a short PRD first.
4. **Vertical slices only.** Ship thin, end-to-end, testable pieces.
5. **Prototype to de-risk.** Only when there is real UX or technical risk.
6. **TDD where practical.** Prefer a failing test before the fix or feature.
7. **Review before handoff.** Every change gets a PASS / FAIL review.
8. **Report every time.** Files changed, tests run, risks — always.

## Choosing a workflow

- **New feature:** `.claude/workflows/new-feature-workflow.md`
- **Bug fix:** `.claude/workflows/bugfix-workflow.md`
- **Review:** `.claude/workflows/review-workflow.md`

## Stop-and-ask triggers

Pause and ask a clarifying question when:

- The goal, users, or acceptance criteria are unclear.
- The change would alter architecture, boundaries, or the data model.
- A new dependency, framework, or pattern seems needed.
- Scope is growing beyond a single vertical slice.

## Guardrails

- Do not modify architecture without explicit approval.
- Do not create `docs/product/` or `docs/adr/` unless explicitly asked.
- Do not install packages without approval.
- Do not leave the codebase broken.
