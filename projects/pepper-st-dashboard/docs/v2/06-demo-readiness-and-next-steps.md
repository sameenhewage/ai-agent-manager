# V2 / 06 — Demo Readiness & Next Steps

> Documentation only. This sequences the work; it **does not** authorise or implement any
> of it. Each item below is an approval-gated slice.

## 0. Engineering rule — Business-Truth TDD Gate (must-read)

> **Before any feature/fix implementation starts, tests must prove the real business
> contract, not just the current implementation path.** (Canonical text: `CONTEXT.md` §7.)

- The **source-of-truth universe** must be defined before implementation.
- If `ai.agno_sessions` has **valid tenant/channel sessions** for a date range,
  Dashboard/Analytics must **either** (1) **include** them in the totals, **or**
  (2) **report explicit exclusion reasons** for every missing session.
- "Given 4 `app_conversations`, the UI shows 4" is **not** a sufficient test — that only
  re-states the implementation. **Parity tests** compare API output to **independent
  fixtures/SQL**. **No PASS** without business-truth tests.
- Tests are **fixture-based + invariant/parity** (the live `ai.*` data grows in real time;
  never pin a snapshot's absolute counts).

## 1. Currently demo-ready

- **Chat Monitor** — list + live, **masked**, IDOR-safe, retention-aware transcripts with
  **WhatsApp-like pagination** (latest page on open, scroll-up loads older — Slice 12E) and
  **customer names** (`ai.customers.name`, masked-contact fallback); customer-LEFT / assistant-RIGHT
  bubbles; no PII/session-id leaks (verified `db:chat:verify` + browser smoke). **Strong demo surface.**
- **Conversation/turn counts & transcripts** for the active set — reliable.
- **Calm loading UX** — one "Updating…" indicator, previous data stays visible
  (Slice 12C-UX).
- **Real-data guarantee** — no fabricated KPIs; masked everywhere.
- **API-driven filters** — deep-linkable `?range=`, keep-previous-data, error/retry.

## 2. Broken / confusing areas (see `04`, `01`)

- **Date-sliced token/cost are misleading** for longer ranges / multi-day sessions
  (lifetime totals attributed to a single `last_at` day). **#1 risk in an analytics demo.**
- **Historical ranges undercount** — 13 of 17 conversations are archived and excluded; only
  ~4 active+live-mapped conversations contribute metrics.
- **new vs returning** is per-conversation, not per-customer (may not match client mental
  model).
- **Customer names** are now shown (`ai.customers.name`, read-only, masked-contact fallback) — but only
  ~5 of 15 historical contacts have a name, so older conversations still fall back to the masked id.
- **`ai.agno_metrics` is empty** — the "correct" date-sliced source is unavailable.
- **`README.md` is stale** (says "Slice 1, no DB access") — documentation hygiene only, not a
  demo blocker. (Left unchanged in this gate; not in scope.)

## 3. Required fixes before a client demo — recommended order

1. **Metric correctness fix** *(highest priority)* — resolve the token/cost source-of-truth
   from `04`: either honestly **label** current figures (lifetime totals for sessions active
   in range) or move to an accurate date-sliced source. Settle **before** any cost/token
   expansion.
2. **Loader policy correction** — already largely done (Slice 12C-UX); re-confirm no
   regressions during the metric work.
3. **Customer name display** — read `ai.customers.name` **read-only**, with the
   name-or-masked-contact fallback (`05`), after product confirms names are OK to show.
4. **Demo polish** — copy/labels, empty/zero states, archived-range messaging, visual QA.
5. **Only then: Slice 12B (cost/token expansion).**

## 4. What NOT to do before the demo

- **No `ai.*` writes**, no migration, no seed/sync/archive without explicit approval.
- **Do not** reintroduce `dashboard.app_customers` / `app_customer_identities`.
- **Do not** start Slice 12B cost/token expansion before the metric source decision (#1).
- **Do not** persist transcript bodies into `dashboard.*` (ADR-0004).
- **Do not** expose raw phone / `user_id` / `external_contact_id` / Agno `session_id`.
- **Do not** implement realtime/SSE or onboarding **in a docs gate** — realtime is now the **mandatory
  Slice 12F** (SSE + automatic Agno sync; see `docs/architecture/08` §5) and ships only after explicit
  approval + failing tests first. *(Chat pagination already shipped in Slice 12E.)*
- **Do not** build against the old `tenant → channel → conversation` model. The **locked** model is
  **`Tenant → Business → optional Location → Channel → Conversation → Agno Session`** (`tenant ≠
  business`) — **ADR-0015** + `docs/architecture/09`. Its schema migration, onboarding, realtime scope,
  and UI filters are **approval-gated** (documented, **not started**).

## 5. Acceptance checklist for the demo

- [ ] Token/cost figures are either **accurate for the demoed range** or **clearly labelled**.
- [ ] The demoed range uses **fresh, in-range sessions** (avoids lifetime-total distortion),
      or archived/historical behaviour is explained.
- [ ] Dashboard + Analytics + Chat Monitor all load real data with **one** calm updating cue.
- [ ] Chat Monitor: list + transcript switching work; **all** contacts masked; no console
      errors; no PII/session-id in any payload.
- [ ] (If shipped) customer name shows for known contacts, **masked contact** fallback
      otherwise; no raw PII introduced.
- [ ] `npm run typecheck`, `npm run test`, `npm run build` green; `db:agno:verify` /
      `db:chat:verify` / `db:analytics:verify` PASS (parity exact).
- [ ] No DB/schema/migration changes shipped as part of demo polish unless separately
      approved.

## 6. Open questions (TO VERIFY with the AI dev / product)

- Will the AI platform **populate `ai.agno_metrics`**? At what `aggregation_period`? What is
  the `token_metrics` JSON shape and the join key? (Enables accurate date-sliced metrics.)
- Are `ai.customers.name` values **real and acceptable to display**? Full or partial mask?
- Should **archived** conversations ever appear in analytics/history, or stay excluded?
- Is **returning customer** expected at contact level (vs the current conversation level)?

## 7. Recommended next step

**The Architecture Finalization Gate now leads the queue.** The multi-business hierarchy
(**`Tenant → Business → optional Location → Channel → Conversation → Agno Session`**, `tenant ≠
business`) is **documented and locked** in **ADR-0015** + **`docs/architecture/09`** (this is a
docs-only gate — no code/migration/`ai.*`). **Await approval of that contract before** starting its
(approval-gated) implementation: **(a)** schema-migration proposal (7-table target via
expand→backfill→verify→enforce), **(b)** onboarding-flow update (tenant → default business → locations →
channels → agent bindings → entitlements), **(c)** realtime-scope update (extend the ADR-0014 event
contract with business/location/channel scope + safe deltas; add `app_realtime_outbox`; keep SSE), and
**(d)** UI filters (business/location/channel).

Also still queued (approval-gated, fail-first): **settle the metric source-of-truth** (`04` §5–§7) and
the token/cost story; and resume **Slice 12F** realtime (foundations 12F-1/12F-2 built then paused for
this gate — see `docs/architecture/08` §5, TD-081, ADR-0014). **Stop here — this is a documentation
gate.**
