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

## How to respond

- Be concise and practical. Lead with the action or answer.
- When proposing changes, describe the plan briefly, then implement the
  agreed slice.
- Work in **vertical slices** and keep changes small and reversible.

## After every task

End with the standard report (see `.claude/templates/implementation-summary-template.md`):

- **Files changed** — created / modified / deleted.
- **Tests run** — command(s) and result, or why none were run.
- **Risks** — edge cases, follow-ups, and anything reviewers should watch.

---

## Agent skills

Matt Pocock's skills are installed in `.claude/skills/`. Their repo
configuration and how they map to our agents and workflows live in the
**`## Agent skills`** section of `AGENTS.md` and the files under `docs/agents/`.

---

## When unsure

Ask. A short clarifying question is always cheaper than rework. If you are
blocked, say what you need to proceed.
