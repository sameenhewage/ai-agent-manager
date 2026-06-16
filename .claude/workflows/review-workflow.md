---
description: How to review a change and return PASS/FAIL
---

# Review Workflow

> Read `AGENTS.md` and `CLAUDE.md` first. Reviews are independent: check the
> work, do not rewrite it. Owner: QA Review Agent.

## Steps

1. **Read the task context**
   - Read the task brief / issue and acceptance criteria.
   - Understand what the change is supposed to deliver.

2. **Inspect the diff**
   - Review created / modified / deleted files.
   - Read the actual changes, not just the summary.

3. **Check acceptance criteria**
   - Confirm each criterion is met.
   - Mark any that are not met.

4. **Check architecture impact**
   - Confirm no unapproved architecture or boundary changes.
   - Flag anything that should have been an ADR.

5. **Check tests + runtime proof**
   - Verify tests exist, protect the **business contract** (not just the current
     implementation, rule 5), and were run.
   - Require **runtime proof** for user-visible behavior (Network tab / DOM /
     console / dev+prod / DB verifier as warranted, rule 6).
   - Confirm **safe DTOs** (rule 8): no raw phone / user / contact / session id,
     no raw `runs` / `session_data`. For a bugfix, confirm the **root cause was
     proven** and **no symptom was masked** (rules 2, 3).

6. **Provide PASS / FAIL**
   - Give a clear verdict with specific reasons.
   - **PASS is forbidden** on "tests pass", "build green", "types pass", "API
     responds", or "a guard/cache/de-dupe was added" alone — it requires
     **user-visible/runtime truth** (Product Truth Gate, rules 1, 6, 11).
   - For FAIL, list exactly what must change.

7. **Suggest follow-up issues (if needed)**
   - Note useful improvements that are out of scope for this change.

## Definition of done

- Clear PASS / FAIL with reasons; **PASS only with product-truth + runtime proof**.
- Acceptance criteria checked one by one against the **X/Y/Z acceptance truth**.
- Tests protect the business contract; **safe DTOs** and root-cause/no-masking
  verified (rules 2, 3, 8).
- Architecture and test coverage verified; follow-ups captured if any.
