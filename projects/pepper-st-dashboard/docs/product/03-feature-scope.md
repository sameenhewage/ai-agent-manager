# 03 — Feature Scope

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15

The authoritative **in / parked / out** list for Phase 1. Mapped against the
"Bloomwire" prototype screens (`demo_site/bloomwire ai chat designs/`).

---

## In scope (Phase 1)

| Feature | Notes | Data source |
|---|---|---|
| **Tenant scoping** | All operational data carries `tenant_id`; fresh empty dashboard per tenant | `dashboard.app_*` |
| **Channel mapping (WhatsApp)** | One channel per tenant, with source-mapping fields | `app_channels` |
| **Chat Monitor (list + transcript)** | Masked contact, last activity, turn count; live transcript | `ai.agno_sessions` (read) |
| **Analytics (date-filtered)** | Real metrics only; ranges Today/3/7/14/30/Month/Custom in the **tenant timezone** | `ai.agno_sessions` (read) |
| **Dashboard summary** | Headline real metrics + recent conversations | derived |
| **Phone masking** | Default-on everywhere incl. logs | presentation/access layer |
| **Retention (query-level)** | Entitlement-driven: `raw_history_retention_days` + `analytics_retention_days` (**NULL = unlimited**; PEPPER ST. = enterprise) | `app_tenant_entitlements` |

### Real metrics available in Phase 1

- Conversation count (per tenant/range).
- New vs returning contacts (by `external_contact_id` first-seen).
- Turns per conversation (`jsonb_array_length(runs)`).
- Displayed message count (non-system, de-duplicated).
- **Token & cost totals** (`session_data.session_metrics`).
- First/last activity timestamps.

---

## Parked (documented, intentionally hidden in Phase 1)

Hidden from nav, design system retained:

- **Orders / Order Conversations**
- **Customer Issues**
- **Exchange Requests**
- **Future Follow-ups**
- **Custom Items**
- **Staff Tasks**
- **Advanced Bot Status** (health widgets, event log)
- **Settings** beyond what's needed to view a tenant
- **Login/Auth, roles enforcement, reveal-phone (admin)**
- **Per-visit/per-day conversation splitting**
- **Live human chat / WhatsApp reply from dashboard** — now **Phase 2 (mandatory)**,
  see ADR-0009 / Workflow 08 (still **out of Phase 1**; canonical transcript stays
  upstream, dashboard stores handover/control/send-status **metadata only**).

### Parked because the data does not exist in Agno today

These prototype fields have **no source** in `ai.agno_sessions` (`metadata` and
`summary` are NULL): **intent, AI summary, confidence, priority, business
category, issue/exchange/follow-up links, AI-resolved KPIs.** They are parked
until the bot emits a stable contract (see `docs/workflows/09-...`).

---

## Out of scope (not this product)

- Building/training/hosting the AI bot.
- Shopify / commerce / checkout / payments / discounts / orders.
- Any write to `ai.agno_*`.
- Copying/duplicating raw chat messages into dashboard storage — including Phase 2
  outbound human replies, which are **metadata-only** (send status by upstream
  message id) unless a future ADR explicitly approves duplication (ADR-0009).

---

## Nav (Phase 1)

```
PEPPER ST.
 ├─ Dashboard
 ├─ Chat Monitor
 └─ Analytics
```

Everything else from the prototype's sidebar is hidden for Phase 1.
