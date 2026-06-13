# AI Team Overview

This repository uses a small, practical AI agent team to build production-grade
web applications. The approach is inspired by a skills-based workflow:
**clarify before coding, keep shared context, write PRDs before implementation,
work in vertical slices, prototype when useful, use TDD where practical, and
review before handoff.**

> Authoritative rules live in `AGENTS.md` (all agents) and `CLAUDE.md`
> (Claude Code). This document is an orientation guide.

## The team

| Agent | One-line purpose | Definition |
|-------|------------------|------------|
| WebApp Orchestrator | Leads the workflow and routes work. | `.claude/agents/webapp-orchestrator.md` |
| Product Discovery Agent | Clarifies users, workflows, success criteria. | `.claude/agents/product-discovery-agent.md` |
| Solution Architect Agent | Advises on boundaries, data, auth, scale. | `.claude/agents/solution-architect-agent.md` |
| Prototype Agent | Builds disposable prototypes on request. | `.claude/agents/prototype-agent.md` |
| Fullstack Builder Agent | Implements one vertical slice at a time. | `.claude/agents/fullstack-builder-agent.md` |
| QA Review Agent | Reviews changes, returns PASS / FAIL. | `.claude/agents/qa-review-agent.md` |
| Handoff Agent | Summarizes work for the next session. | `.claude/agents/handoff-agent.md` |

## How they work together

```
WebApp Orchestrator
  ├─ Product Discovery   (what & why)
  ├─ Solution Architect  (shape & trade-offs)
  ├─ Prototype           (de-risk, optional)
  ├─ Fullstack Builder   (implement one slice)
  ├─ QA Review           (PASS / FAIL)
  └─ Handoff             (summary & next steps)
```

## Where things live

- **Agent definitions:** `.claude/agents/`
- **Workflows:** `.claude/workflows/`
- **Templates:** `.claude/templates/`
- **Team docs:** `docs/agents/`

## Not yet created (by design)

- `docs/product/` — created later, only when product work begins.
- `docs/adr/` — created later, only when an architecture decision is recorded.
