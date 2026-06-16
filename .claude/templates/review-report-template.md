# Review Report

> Produced by the QA Review Agent. Review the work; do not rewrite it.
> PASS requires user-visible/runtime truth (`AGENTS.md` rules 1, 6, 11) — never
> "tests/build pass" or "a guard was added" alone.

## Result
PASS | FAIL

## Product-truth verdict (rule 1)
- Requirement (X/Y/Z): <acceptance truth>
- Browser/runtime behavior + source of truth match? <yes/no> — <how verified>

## Acceptance criteria
- [ ] <criterion 1> — met / not met
- [ ] <criterion 2> — met / not met

## Root cause (for bugfixes, rules 2-3)
- Proven? <yes/no> — <owner / why / dev-or-prod>. Symptom masked as primary fix? <no/yes>

## Findings
- Bugs: <list or none>
- Edge cases: <list or none>
- Security / safe DTO: <raw phone/user/contact/session id or runs/session_data leaks? or none>
- Maintainability / over-engineering: <list or none>

## Architecture impact
<any unapproved changes or duplicate state/tables? should this have been an ADR?>

## Tests
- Adequate & business-truth (not implementation-shaped)? <yes/no>
- Fail-first where practical? <yes/no> — Notes: <coverage gaps or missing cases>

## Runtime / network proof (rule 6)
- <Network tab / DOM / console / dev+prod / DB verifier evidence, or why N/A>

## Required changes (if FAIL)
- <what must change to pass>

## Follow-up issues (optional)
- <suggested out-of-scope improvement>
