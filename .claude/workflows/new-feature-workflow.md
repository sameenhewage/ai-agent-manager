---
description: How to build a new feature, from clarification to handoff
---

# New Feature Workflow

> Read `AGENTS.md` and `CLAUDE.md` first. The WebApp Orchestrator drives this
> workflow and routes each step to the right agent.

## Steps

1. **Clarify the requirement**
   - Restate the request in your own words.
   - Ask questions until the goal and users are clear.
   - Owner: Product Discovery Agent.

2. **Define scope**
   - Write what is in scope and out of scope.
   - Agree on acceptance criteria.
   - Owner: WebApp Orchestrator.

3. **Identify affected areas**
   - List modules, files, and data that the change touches.
   - Note architecture impact (route to Solution Architect if needed).

4. **Create or request a PRD (if needed)**
   - For non-trivial features, capture a short PRD before coding.
   - Skip for tiny, obvious changes.

5. **Split into vertical slices**
   - Break the feature into thin, end-to-end slices.
   - Each slice should be independently testable.

6. **Prototype first (only if useful)**
   - If there is real UX or technical risk, build a disposable prototype.
   - Owner: Prototype Agent.

7. **Implement one slice**
   - Build a single slice: UI + API + validation + data + tests when relevant.
   - Use TDD where practical.
   - Owner: Fullstack Builder Agent.

8. **Test**
   - Run tests and verify the slice meets acceptance criteria.

9. **Review**
   - Independent check against acceptance criteria and quality.
   - Output PASS / FAIL.
   - Owner: QA Review Agent.

10. **Handoff**
    - Summarize work, files changed, tests run, risks, next steps.
    - Owner: Handoff Agent.

## Definition of done

- Acceptance criteria met for the slice.
- Tests run and passing (or a clear reason why not).
- Review is PASS.
- Handoff produced.
