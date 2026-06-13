# Agent Responsibilities

A quick reference for what each agent owns and what it must not do. Full
definitions live in `.claude/agents/`.

## WebApp Orchestrator

- **Owns:** the workflow, next-step decisions, routing, scope gatekeeping.
- **Must not:** write production code or make product/architecture calls alone.

## Product Discovery Agent

- **Owns:** users, roles, workflows, pain points, success criteria.
- **Must not:** design the database, write code, or pick technology.

## Solution Architect Agent

- **Owns:** system boundaries, data ownership, auth, tenancy, scalability,
  maintainability; recommends when an ADR is needed later.
- **Must not:** implement code or create `docs/adr/` now.

## Prototype Agent

- **Owns:** disposable prototypes that de-risk an idea, on request.
- **Must not:** pollute production code or treat prototypes as final.

## Fullstack Builder Agent

- **Owns:** implementing one vertical slice (UI + API + validation + data +
  tests when relevant), following conventions.
- **Must not:** redesign architecture casually or build without a task.

## QA Review Agent

- **Owns:** reviewing changes against acceptance criteria; PASS / FAIL.
- **Must not:** rewrite the feature or approve untested work.

## Handoff Agent

- **Owns:** the handover summary — files changed, tests run, risks, next steps.
- **Must not:** implement changes or hide unfinished work.

## Hand-off chain

```
Discovery -> Architecture -> (Prototype) -> Build -> Review -> Handoff
                         ^                                   |
                         |___________ Orchestrator __________|
```
