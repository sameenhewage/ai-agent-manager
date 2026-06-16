# 05 — Dashboard / Analytics / Chat Monitor — Product Gaps (Gate 12)

- **Project:** pepper-st-dashboard
- **Date:** 2026-06-16
- **Status:** Phase 1 is functionally live again after Slice 11B (real data in Dashboard, Chat Monitor,
  Analytics). This doc captures the **product-visible gaps** found in Gate 12 and frames them as
  *possibility* — **not approved scope**. Approval + sequencing live in
  `docs/phases/phase-1-post-acceptance-hardening.md`; technical design in
  `docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md`.

> **Product guardrails (unchanged, non-negotiable):** the dashboard **monitors and displays** only — it
> does **not** send WhatsApp messages or AI replies (the AI platform owns that). **Real data only** — no
> invented intent/sentiment/AI-resolution/CSAT/revenue/priority. All contact numbers are **masked**;
> transcripts are **read-only** and never copied into the dashboard.

---

## 1. Gap → product impact → guardrail

| # | Gap (user-visible) | Why it matters to the operator | Guardrail |
|---|---|---|---|
| G1 | **Cost/token view is shallow** — only total tokens + est. cost + a tokens/day chart | Operators can't see input vs output vs reasoning/cache usage, cost over time, or avg cost per chat to understand spend | Use only real `session_metrics` fields; show coverage; warn when cost is missing; never estimate a missing cost |
| G2 | **Filter clicks feel slow** — range changes recompute the whole page · **✅ addressed by Slice 12C (TD-071) + Slice 12C-API (TD-073 / ADR-0013)** | Feels laggy/unresponsive even though data is correct; gets worse as volume grows | Keep "real data only"; no fake instant numbers; show honest "updating…" state — **done:** TD-071 added previous-data-stays + per-region `aria-busy` dim + spinner-on-clicked-range + polite "Updating…" badge; **TD-073** then moved dynamic data to internal `/api/dashboard` + `/api/analytics` routes consumed by **client widgets** (keep-previous-data + localized pending + user-safe **error/retry**), with initial paint still SSR. Real-time refresh (G3) remains a separate, approval-gated slice |
| G3 | **Not real-time** — data refreshes only on navigation/manual reload | A monitoring console should reflect new conversations/messages without a manual refresh | Read-only polling/SSE; never implies the dashboard is sending or controlling chats |
| G4 | **Chat Monitor is a static transcript** — loads/holds the whole conversation, no scroll-up history, no auto-scroll to latest | Doesn't behave like WhatsApp Web; awkward for long threads; no sense of "newest at bottom" | Mask PII; hide system/tool; read-only; load older on demand from `ai.*` (no duplication) |
| G5 | **No explicit "live/last-updated" cue** | Operator can't tell how fresh the numbers are | Honest timestamp; pause when tab hidden |
| G6 | **v1 leftover contact rows retain historical phone PII** (archived only) | PII-hygiene/compliance posture | Excluded from active views; purge is a separate, approval-gated decision |

---

## 2. Desired Chat Monitor behaviour (WhatsApp-like) — product description

- Newest messages at the **bottom**, visible the moment a conversation opens.
- Scrolling **up** loads older messages on demand (paged), with the scroll position staying put (no
  jump) as older bubbles are prepended.
- New incoming messages appear at the bottom; if the operator has scrolled up, a **"new messages ↓"**
  cue appears instead of yanking them down.
- The transcript pane scrolls **internally** — the page itself never grows.
- Contact numbers masked; system/tool/debug messages hidden; everything read-only and sourced live from
  the Agno session (`runs[].messages[]`).

## 3. Desired Analytics/Dashboard behaviour

- Range filters feel responsive: previous numbers stay on screen with a clear "updating…" cue while the
  new range computes; individual widgets fill in as they're ready.
- Cost/token section answers: *how many tokens (in/out/reasoning/cache), what did it cost, how is cost
  trending, what's the average cost per conversation, and how complete is the data?* — all from real
  metrics, with a clear warning when some sessions don't report cost.
- A subtle **"Live • updated HH:MM"** marker; counters refresh on a sensible cadence without a manual
  reload.

## 4. Explicitly **not** in scope (still parked / possibility only)

Per-contact cost (PII-gated), per-model/provider cost breakdown, platform-wide daily rollups
(`agno_metrics`), human handover/approvals monitoring (`agno_approvals`), knowledge-base visibility,
orders/issues/exchanges/CSAT/sentiment/intent — none have an approved Phase 1 source and several are
PII-sensitive. Document-only until a stable upstream contract + product approval exist (ADR-0007/0008).

## 5. Pointers

- Technical design & tiers → `docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md`
- DB re-verification & dump comparison → `docs/database/07-old-vs-current-db-comparison.md`
- Slice roadmap (goals/guardrails/risks) → `docs/phases/phase-1-post-acceptance-hardening.md`
