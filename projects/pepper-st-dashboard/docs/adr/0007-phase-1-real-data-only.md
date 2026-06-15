# ADR-0007 — Phase 1 Shows Only Real Data

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0008, `docs/product/03-feature-scope.md`

## Context

The "Bloomwire" prototype shows rich fields: intent, AI summary, confidence,
priority, business category, exchanges, issues, follow-ups, tasks, AI-resolved
KPIs. Stage 1 inspection proved **none of these exist** in `ai.agno_sessions`
(`metadata` and `summary` are NULL; there is only session state, token metrics,
and the raw `runs[]`).

## Decision

1. **Phase 1 surfaces only real, available data:** contact/session id (masked),
   transcript, timestamps, turn/message counts, token/cost metrics.
2. **Do not fabricate** intent, AI summary, confidence, priority, business
   category, issue/exchange/follow-up links, or AI-resolved KPIs.
3. **Hide** the unsupported prototype screens (Orders, Issues, Exchanges,
   Follow-ups, Custom Items, Staff Tasks, advanced Bot Status). Nav = Dashboard,
   Chat Monitor, Analytics.
4. **Keep the prototype's visual style** (colors, layout, components) — just don't
   build unbacked screens.
5. **Park richer AI metadata** until the bot emits it via a stable contract
   (ADR-0008).

## Consequences

- The UI is honest: every card/field is backed by data.
- Less visual density than the prototype; acceptable and intentional.
- When the bot later emits intent/summary/etc., they slot into existing surfaces
  without redesign.

## Alternatives considered

- **Heuristic enrichment now** (e.g. derive "intent" via keyword rules, fake an
  "AI summary" from the first user line): rejected for Phase 1 to avoid presenting
  guesses as facts. May be reconsidered as clearly-labelled "derived" hints later.
- **Show empty placeholder cards** for parked metrics: rejected — clutter and
  implies data exists. Hidden instead.
