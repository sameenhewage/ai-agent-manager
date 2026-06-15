# PEPPER ST. — Agent Boundaries (all agents)

Every global agent working on the PEPPER ST. dashboard MUST honor these on top of
`AGENTS.md` and `CLAUDE.md`. If a boundary blocks the task, **stop and ask** — never
work around it silently.

## Hard boundaries

- **No app code** unless the **current slice explicitly allows it** (see the slice
  plan and `docs/phases/phase-1-implementation-plan.md`). **Slice 0 = no code.**
- **No DB writes without approval.**
- **No migrations applied without Gate 2 approval.** Slice 2 only **proposes** a
  migration; applying happens in Slice 3 after Gate 2.
- **No changes to `ai.agno_*`** — it is **read-only**, always.
- **No `app_conversation_messages`** (or any message-body table).
- **No duplicated chat transcript** in `dashboard.*`.
- **Canonical transcript stays in the Agno / WhatsApp pipeline** (ADR-0004 / ADR-0009);
  the dashboard renders it **live, read-only**.
- **Tenant safety preserved** — every operational query is `tenant_id`-scoped.
- **Docs + handoff updated for every slice** (living docs).
- **No hidden pricing/subscription assumptions** — entitlements are **explicit**;
  `NULL` retention = **unlimited**; no hidden `standard` / 30-day DB default.
- **PEPPER ST. seed = enterprise / fully enabled / unlimited retention.**
- **Phase 2 live WhatsApp human handover is mandatory but NOT implemented in Phase 1.**

## Forbidden tables (Phase 1)

Do **not** create any of these (each needs its own scope + ADR + gate if ever picked up):

`app_conversation_messages`, `app_analytics_daily`, `app_plans`, `app_plan_features`,
`app_tenant_subscriptions`, issue / exchange / follow-up / order tables,
auth / member / role tables, audit / queue / job tables.

## PII / masking

Phone numbers and `session_id` are **masked by default** in UI **and** logs, via a
shared util (ADR-0005). Raw phone is never logged. Full reveal is a future admin-only
capability (Phase 2 + auth).

## Gate reminders

- **Gate 0** — subagent readiness (this doc set). Must pass first.
- **Gate 2** — schema migration approval (before any apply / seed).
- **Gate 3** — tech stack (locked: Next.js + TS + Tailwind + shadcn/ui + Drizzle + Zod).
- **Gate 4** — per-slice QA + docs/handoff update.

## When blocked

State the specific boundary that blocks you and what approval / input is needed to
proceed. Escalate to the `webapp-orchestrator`; do not improvise around a boundary.
