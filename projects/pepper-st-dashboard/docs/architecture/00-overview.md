# Architecture 00 — System Overview

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first) — proposal
- **Last updated:** 2026-06-15

## Purpose

Describe the system context, boundaries, and the read-only relationship between
the **dashboard** and the existing **Agno** AI agent.

## System context

```
                        ┌─────────────────────────────┐
   WhatsApp customer ◄──┤        Agno AI Agent         │  (EXTERNAL — we do not own)
                        │  agent_id = concierge        │
                        │  writes sessions             │
                        └──────────────┬──────────────┘
                                       │ writes
                                       ▼
                        ┌─────────────────────────────┐
                        │  PostgreSQL 16.9             │
                        │  schema: ai                  │
                        │   └─ ai.agno_sessions  ◄─────┼──── READ ONLY (no writes)
                        │  schema: public             │
                        │  schema: dashboard  (NEW)    │
                        │   └─ app_* mapping tables    │
                        └──────────────┬──────────────┘
                                       │ reads (live)
                                       ▼
                        ┌─────────────────────────────┐
                        │   PEPPER ST. Dashboard       │
                        │   Dashboard · Chat Monitor   │
                        │   · Analytics                │
                        │   (tenant-scoped)            │
                        └─────────────────────────────┘
```

## Boundaries (hard rules)

1. **Agno is upstream and authoritative** for conversations and transcripts. The
   dashboard **reads** `ai.agno_sessions`; it **never writes** to `ai.*`. Phase 2
   live replies go **through the bot/WhatsApp API** (the bot persists), never by
   writing `ai.*` (ADR-0009).
2. **No raw message duplication.** The dashboard stores only **mapping/index**
   records (`dashboard.app_*`). Transcripts are rendered **live** on demand. This
   holds in **Phase 2** too: the dashboard may add **handover/control/send-status
   metadata**, but **never message bodies** — there is **one** canonical transcript,
   upstream (ADR-0009).
3. **Separate schema, same database.** The dashboard owns a new `dashboard`
   schema with `app_`-prefixed tables. No tenant-specific or channel-specific
   tables/schemas.
4. **Tenant scoping is mandatory** on every operational table.
5. **Shopify/commerce is out of scope** entirely.

## Logical components (Phase 1)

- **Mapping/index layer** (`dashboard.app_*`): tenants, channels, customers,
  customer identities, conversations, tenant entitlements.
- **Agno read adapter**: resolves an `agno_session_id` → live transcript + metrics
  from `ai.agno_sessions`, applying retention + masking.
- **Analytics aggregator**: computes real metrics over `ai.agno_sessions` for a
  tenant + date range (epoch-second conversion).
- **Presentation**: prototype-styled UI (Dashboard, Chat Monitor, Analytics).

## Key data facts (from Stage 1 inspection)

- `ai.agno_sessions.session_id` (varchar PK) **is the WhatsApp phone number**.
- One **rolling** session row per phone; turns append to `runs[]`.
- `created_at`/`updated_at` are **epoch seconds** (bigint).
- `metadata` and `summary` are **NULL**; only `session_data` (state + metrics)
  and `runs[]` carry usable content.
- Single agent `concierge`; `session_type = agent`.

## Cross-cutting concerns

- **PII/masking** — `docs/workflows/07-pii-phone-masking.md`, ADR-0005.
- **Retention** — `docs/workflows/06-retention-access-limit.md`, ADR-0006.
- **Multi-tenancy** — `04-multitenancy.md`, ADR-0002.
- **Future identity contract** — `docs/workflows/09-...`, ADR-0008.
- **Live human handover (Phase 2)** — `docs/workflows/08-...`, ADR-0009 (canonical
  transcript stays upstream; dashboard stores control-plane metadata only).

## What is NOT decided here

- Tech stack is **locked** → `05-tech-stack.md` (Next.js + TypeScript + Tailwind +
  shadcn/ui + Drizzle ORM + PostgreSQL + Zod). Deploy target still open.
- Physical schema → `02-schema-proposal.sql.md` is the **review artifact**; the
  applied implementation is a **Drizzle schema + Drizzle migrations** (not applied
  yet — separate gate).
