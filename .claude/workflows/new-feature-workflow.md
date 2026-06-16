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
   - **Write the acceptance truth** (Product Truth Gate, `AGENTS.md` rule 1):
     "User expects X. Current system does Y. Done means Z."
   - Owner: Product Discovery Agent.

2. **Define scope**
   - Write what is in scope and out of scope.
   - Agree on acceptance criteria.
   - Owner: WebApp Orchestrator.

3. **Identify affected areas + source of truth**
   - List modules, files, and data that the change touches.
   - **Identify the source of truth** (rule 7): which table/API/service owns the
     data, what is read-only vs writable, and how missing/stale data is surfaced.
     Do **not** plan duplicate tables or duplicate state without an ADR.
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
   - One behavior = **one owner** (rule 4); use the **smallest correct fix**
     (rule 9); expose **safe DTOs only** (rule 8).
   - Use TDD where practical — tests protect the **business contract**, fail-first
     where practical (rule 5).
   - Owner: Fullstack Builder Agent.

8. **Test + prove at runtime**
   - Run tests and verify the slice meets acceptance criteria.
   - Provide **runtime proof** the user-visible behavior matches the requirement
     (Network tab / DOM / console / dev+prod / DB verifier as warranted, rule 6).
     "Tests pass" alone is not done.

9. **Review**
   - Independent check against acceptance criteria and quality.
   - Output PASS / FAIL.
   - Owner: QA Review Agent.

10. **Handoff**
    - Summarize work, files changed, tests run, risks, next steps.
    - Owner: Handoff Agent.

## Definition of done

- **Product-truth verified**: browser/runtime behavior + source of truth +
  workflow match the acceptance truth (rules 1, 6) — not just green tests.
- Acceptance criteria met for the slice; business-truth tests fail-first where
  practical (rule 5).
- **Safe DTOs** verified for any API change (rule 8); no unapproved
  architecture/duplicate-state (rules 7, 9).
- Review is PASS; report follows the **Final PASS Report Standard** (rule 11).
- Relevant docs updated (rule 10); handoff produced.
