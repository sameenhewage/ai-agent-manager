# 00 — Product Vision

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15

## Vision

Give businesses that run an **Agno WhatsApp AI agent** a clear, trustworthy
**operations console** over their AI conversations — without rebuilding the bot
and without touching commerce systems. The dashboard turns raw AI sessions into
**monitorable conversations, readable history, and honest analytics**, scoped
per business (tenant).

## Problem

The AI bot already converses with customers and stores everything in
`ai.agno_sessions`, but that data is:

- **opaque** — JSON `runs[]`/`messages[]` are not human-friendly;
- **single-tenant by accident** — `session_id` is a global phone-number primary
  key, with no business/channel scoping;
- **not analyzable** — no ready way to filter by date range or see volume/cost;
- **sensitive** — phone numbers are exposed as identifiers.

## Product principles

1. **Truth over decoration.** Show only data we actually have. Never fabricate
   intent/summary/priority to fill a pretty card.
2. **Read, don't own.** Agno owns conversations; we map and present them. We
   never mutate `ai.agno_*` or copy raw messages.
3. **Tenant-first.** Every record is tenant-scoped from day one; onboarding a new
   business produces a clean, empty dashboard.
4. **Privacy by default.** Phone numbers/`session_id` are masked unless an
   admin explicitly reveals them (future).
5. **Living documentation.** Decisions and workflows are written down, phase by
   phase; docs are part of "done".

## Outcomes we want (Phase 1)

- A tenant can open **Chat Monitor** and read any conversation transcript,
  rendered cleanly from Agno, with masked contact ids.
- A tenant can open **Analytics** and filter by Today/3/7/14/30 days/This
  month/Custom and see **real** volume, turn, and token/cost figures.
- A tenant's **Dashboard** summarizes only metrics we can truly compute.
- Adding a second business proves tenant isolation (separate empty dashboard).

## Non-goals (Phase 1)

- No bot building/tuning, no Shopify/commerce, no payments.
- No fabricated AI metadata (intent, summary, confidence, priority, business
  category, issue/exchange/follow-up links, AI-resolved %).
- No login/auth, billing enforcement, or live human chat **in Phase 1** (auth/
  billing parked; live human chat is **Phase 2 — mandatory**, ADR-0009).

## Success signals

- Zero fabricated metrics in the UI.
- 100% of operational queries are tenant-scoped.
- Transcript rendering matches Agno (no duplicated history, no system prompts).
- Phone numbers masked everywhere by default (incl. logs).
