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

3. **Create a hypothesis**
   - State the suspected root cause clearly.
   - Add logging or a failing test to confirm if needed.

4. **Make the smallest safe fix**
   - Fix the root cause with the minimal change.
   - Avoid unrelated refactors or scope creep.

5. **Test before / after**
   - Show the failing behavior before the fix.
   - Show it passing after the fix.
   - Add a regression test where practical.

6. **Document evidence**
   - Record the root cause, the fix, and proof it works.

7. **Handoff**
   - Summarize the fix, files changed, tests run, and residual risks.
   - Owner: Handoff Agent.

## Definition of done

- Root cause identified (not just the symptom).
- Smallest safe fix applied.
- Regression test added where practical.
- Before/after evidence documented.
- Handoff produced.
