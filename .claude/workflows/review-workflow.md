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

5. **Check tests**
   - Verify tests exist and cover the criteria and key edge cases.
   - Confirm they were run and their result.

6. **Provide PASS / FAIL**
   - Give a clear verdict with specific reasons.
   - For FAIL, list exactly what must change.

7. **Suggest follow-up issues (if needed)**
   - Note useful improvements that are out of scope for this change.

## Definition of done

- Clear PASS / FAIL with reasons.
- Acceptance criteria checked one by one.
- Architecture and test coverage verified.
- Follow-ups captured if any.
