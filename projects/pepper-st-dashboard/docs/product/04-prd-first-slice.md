# 04 — PRD: First Vertical Slice

- **Project:** pepper-st-dashboard
- **Status:** ✅ **Delivered (Slice 5, 2026-06-15)** — Chat Monitor live on real data
  (see `docs/handoff/2026-06-15-slice-5-chat-monitor.md`)
- **Last updated:** 2026-06-15

> This PRD describes the **first vertical slice** to build **after** the
> `dashboard` schema migration is approved. No code is written during the
> docs-first bootstrap.

## Slice name

**"Tenant-scoped Chat Monitor reading live from Agno."**

## Why this slice first

It exercises the entire spine end-to-end: tenant scoping → channel/customer/
conversation mapping → live Agno transcript rendering → PII masking → retention
at read time. It proves the architecture with the **smallest honest feature**.

## User story

> As a **Tenant Operator** for **PEPPER ST.**, I can open **Chat Monitor**, see a
> tenant-scoped list of conversations with **masked** contact ids, last-activity
> time, and turn count, and open one to read its **transcript** rendered live
> from Agno — with no fabricated fields and with the tenant's **retention window**
> applied at read time.

## Scope of this slice

**In**

- Seed (doc-defined) tenant **PEPPER ST.** + WhatsApp channel mapped to
  `agent_id = concierge`.
- Conversation list for the tenant (from mapped Agno sessions).
- Transcript view (flatten `runs[].messages[]`, drop `system`, dedupe by `id`,
  order by `created_at`).
- Phone masking by default.
- Retention as a read-time **access limit** driven by `app_tenant_entitlements`
  (`raw_history_retention_days`; **`NULL` = unlimited**): both the conversation list
  and the transcript respect the window (out-of-window conversations → restricted/
  empty state). **PEPPER ST. is enterprise / unlimited**, so nothing is excluded —
  but the windowing logic is still implemented (a standard 30-day tenant would see
  older items excluded).

**Out (later slices)**

- Analytics + Dashboard cards (next slice).
- Onboarding UI, auth, reveal-phone, live reply.

## Acceptance criteria

1. **Tenant isolation:** the list shows only conversations for the selected
   tenant; a second seeded tenant shows an empty list.
2. **Mapping:** each listed conversation resolves to exactly one
   `ai.agno_sessions` row via `agno_session_id`.
3. **Masking:** no full phone number appears in UI or logs (e.g. `94•••••815`).
4. **Transcript fidelity:** rendered messages contain **no `system` messages**,
   **no duplicates** (deduped by `id`), ordered by `created_at`; system prompt
   repetition across runs does not appear.
5. **No fabrication:** no **Agno-derived** intent / summary / confidence / priority /
   business-status fields are shown (they don't exist in Agno). A **dashboard-owned**
   conversation `status` exists internally (`open`/`resolved`/`archived`), but Phase 1
   does **not** surface it as a meaningful AI/business signal because it defaults to
   `open` for every conversation.
6. **Retention (access limit):** when the tenant has a finite
   `raw_history_retention_days`, messages older than the window are not rendered and
   a conversation whose last activity (`last_at`) is older than the window is **not
   listed** as normal history (direct access → **restricted/empty retention state**).
   When it is **`NULL` (unlimited, as for PEPPER ST.)**, nothing is excluded. Either
   way, `ai.agno_sessions` is never modified or deleted.
7. **Read-only:** zero writes to `ai.*`; transcript is not persisted in
   `dashboard.*`.

## Test intent (TDD targets for the build phase)

- Transcript builder: given a fixture session with multi-run history +
  `from_history` + `system` messages → returns ordered, de-duplicated,
  system-free list.
- Masking util: phone → masked form; never logs raw value.
- Tenant scoping: query for tenant A excludes tenant B's conversations.
- Retention: with a finite window, messages outside it are filtered; with `NULL`
  (unlimited) nothing is filtered; the session row is never touched either way.

## Dependencies / gates

- **Gate 1 (done):** Stage 1 analysis approved.
- **Gate 2 (pending):** approve `dashboard` schema migration
  (`docs/architecture/02-schema-proposal.sql.md`).
- **Gate 3 (locked):** tech stack approved (`docs/architecture/05-tech-stack.md`).
- Then build this slice (TDD), QA review, update docs + handoff.

## Definition of done

- Acceptance criteria pass with automated tests.
- Docs updated: this PRD marked delivered, relevant workflow(s) confirmed, and a
  decision-log entry added. Handoff written.
