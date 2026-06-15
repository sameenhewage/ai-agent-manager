# 01 — Users and Roles

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15

> Auth/login is **parked** for Phase 1. Roles are documented now so the data
> model and UI don't have to be retrofitted later. In Phase 1 the app behaves as
> a single implicit operator viewing a selected tenant.

## Actors

### End Customer (external, not a dashboard user)
The person chatting with the tenant's bot on WhatsApp (the AI, or — after a
Phase 2 handover — a human operator). They never log into the
dashboard. Represented by `app_customers` + `app_customer_identities`. The
dashboard usually knows only their **External Contact ID** (phone), shown masked.

### Tenant Operator (primary Phase 1 user)
A staff member of the business (e.g. PEPPER ST.) who monitors conversations and
reads analytics. In Phase 1 there is no login; the operator implicitly acts
within one **selected tenant**. All data they see is tenant-scoped.

### Tenant Admin (future)
Can reveal full phone numbers, manage channel/source mapping, manage staff, and
configure retention/plan. **Parked** (auth required first).

### Platform Operator / Onboarder (future)
Creates new tenants (businesses) and their initial channel mapping. In Phase 1
this is a **documented manual/seed workflow**, not a UI.

## Role → capability matrix (target)

| Capability | End Customer | Tenant Operator | Tenant Admin (future) | Platform Operator (future) |
|---|---|---|---|---|
| Chat with bot (WhatsApp) | ✅ | — | — | — |
| View Chat Monitor (tenant-scoped) | — | ✅ | ✅ | ✅ |
| View Analytics (tenant-scoped) | — | ✅ | ✅ | ✅ |
| Reveal full phone number | — | ❌ (masked) | ✅ | ✅ |
| Manage channel/source mapping | — | ❌ | ✅ | ✅ |
| Create/onboard a tenant | — | ❌ | ❌ | ✅ |
| Configure retention/plan | — | ❌ | ✅ | ✅ |
| Take over conversation (handover) — *Phase 2* | — | ✅ | ✅ | — |
| Reply to customer on WhatsApp — *Phase 2* | — | ✅ | ✅ | — |

> **Phase 2 (mandatory):** live WhatsApp human handover (ADR-0009, Workflow 08) —
> when the AI cannot complete a task, a Tenant Operator/Admin can **take over** and
> **reply** to the customer. Gated by auth; the canonical transcript stays upstream
> and the dashboard stores **handover/control/send-status metadata only**.

## Phase 1 simplifications

- No authentication or session management for dashboard users.
- "Current tenant" is selected/seeded, not logged-in.
- Masking is **always on** in Phase 1 (no reveal capability yet).
- Role checks are documented and reflected in the schema (tenant scoping) but
  not enforced by auth middleware yet.

## Implications for the data model

- All operational tables carry `tenant_id` so role/tenant scoping can be enforced
  later without migration churn.
- Phone reveal being admin-only later means masking must be a **presentation +
  access** concern, not stored masked (we store the real value, mask on read).
