---
description: How to fix a bug safely, from reproduction to handoff
---

# Bugfix Workflow

> Read `AGENTS.md` and `CLAUDE.md` first. Prefer the smallest safe fix that
> addresses the root cause, not the symptom.

## Steps

1. **Reproduce the issue**
   - Get exact steps, inputs, and expected vs actual behavior.
   - Confirm you can reproduce it before changing anything.

2. **Identify owner / source**
   - Locate the module and code path responsible.
   - Note which area / agent owns it.

3. **Prove the root cause** (`AGENTS.md` Root Cause Gate, rule 2). Report all six:
   1. current flow, 2. the **exact owner** of the behavior, 3. **why** it happens,
   4. **dev, production, or both**, 5. the **smallest correct root fix**, 6. what
   you will deliberately **not** change. Add a failing test or logging to confirm.

4. **Make the smallest root fix** (rules 3, 4, 9)
   - Fix **ownership / data flow**, not the symptom. One behavior = **one owner**.
   - **Do not** make a global request de-dupe / cache / broad guard / retry /
     timeout / silent fallback / extra loader / duplicate state / new table the
     **primary** fix. Such patches are allowed **only** as supporting safety
     **after** the root cause is fixed, and must be justified.
   - Use the smallest correct change; avoid unrelated refactors or scope creep.

5. **Prove it — before / after** (Runtime Proof Gate, rule 6)
   - Show the failing behavior **before** and passing **after**.
   - Add a regression test that protects the **business contract** (rule 5).
   - Provide **runtime proof** for user-visible behavior (Network tab / DOM /
     console / dev+prod / DB verifier as warranted) — "tests pass" alone is not PASS.
   - Confirm no **safe-DTO** regression (rule 8): no raw phone / user / contact /
     session id, no raw `runs` / `session_data` in any response.

6. **Document evidence**
   - Record the root cause, the fix, and proof it works.

7. **Handoff**
   - Summarize the fix, files changed, tests run, and residual risks.
   - Owner: Handoff Agent.

## Definition of done

- **Root cause proven** (the six-item report), not just the symptom.
- **Ownership fixed**; no symptom-masking patch used as the primary fix (rules 3, 4).
- Smallest correct fix applied; no unapproved new libs/tables/abstractions (rule 9).
- Regression test protects the **business contract** and fails-first where practical.
- **Before/after + runtime proof** documented (rule 6); safe DTOs verified (rule 8).
- Report follows the **Final PASS Report Standard** (rule 11); handoff produced.
