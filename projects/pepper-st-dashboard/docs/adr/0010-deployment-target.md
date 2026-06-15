# ADR-0010 — Deployment Target

- **Status:** **Proposed** (Gate 9 recommendation; awaiting product-owner approval — not yet locked)
- **Date:** 2026-06-15
- **Related:** ADR-0001 (technical baseline), `docs/architecture/05-tech-stack.md` (open question #3),
  `docs/deployment/01-deploy-readiness.md`, `docs/changelog/technical-decision-log.md` (TD-063)

## Context

Phase 1 is accepted (Gate 8 PASS). The app is a Next.js 15 App Router server app whose Dashboard and
Analytics routes are `force-dynamic` and read PostgreSQL **per request**, backed by a lazily-created
**singleton `pg` connection pool** (`lib/db/client.ts`). Critically, the database is the **same
PostgreSQL instance that hosts the external Agno/WhatsApp pipeline's `ai.agno_sessions`**, which the
dashboard reads **read-only**, and it contains **PII** (WhatsApp phone numbers are the session ids).
`05-tech-stack.md` deliberately left the deploy target ("Vercel-style vs self-host") open for this gate.

The dashboard **monitors/reads only** — it never sends WhatsApp/AI replies (CONTEXT §2, ADR-0004/0009).

## Decision (proposed)

1. **Deploy as a single long-running Node process (self-host: VPS / Docker / `next start`), co-located
   on the same host or private network/VPC as the Agno PostgreSQL** — for **both** the demo and (in a
   hardened form) production. One model, so the demo exercises the real production topology.
2. **Keep the Agno PostgreSQL private** (no public exposure); the warm, bounded singleton pool fits a
   long-running process as the code is written today.
3. **Production hardening** (tracked, not required for the demo): containerize with
   `output: 'standalone'`; a **dedicated read-only DB role for `ai.*`**; **explicit pool SSL +
   bounded `max`**; **PgBouncer** if horizontally scaled; the deferred **analytics rollup** before
   onboarding many tenants; and **real auth** to replace the temporary `DEMO_TENANT_SLUG` resolver.
4. **TLS and security headers terminate at a reverse proxy** (Caddy/Nginx) in front of `next start`.

## Consequences

- Lowest-risk data path: a PII database stays on a private network with a warm, bounded pool instead of
  being exposed to a serverless provider's egress with per-invocation connection churn.
- The team owns ops (process manager, TLS proxy, log shipping) — acceptable because the box that runs
  the Agno pipeline can usually host the dashboard too, at low marginal cost.
- The demo is simply the un-hardened production target, avoiding environment-specific surprises.
- If a zero-ops **public** demo URL becomes a hard requirement, Vercel remains a fallback **only** with
  a connection pooler (PgBouncer/serverless driver) and a safely TLS-exposed DB — see Alternatives.

## Alternatives considered

- **Vercel (serverless):** best-in-class App Router DX and zero-ops, but serverless invocations create
  per-instance pools against a **shared PII DB** (connection-storm risk) and require the DB to be
  reachable over the public internet. Rejected as the primary target until a pooler + pool tuning are
  in place; retained as a documented fallback for a public demo.
- **Static export / client-side DB calls:** impossible — server-side PG reads, masking, and retention
  are mandatory (ADR-0001 already rejected this).
- **Separate managed DB for the dashboard:** unnecessary — Agno data is in the same PG; a second DB
  adds cross-DB reads and ops for no Phase 1 benefit (consistent with ADR-0001).

> This ADR is **Proposed**. On product-owner approval of a concrete target, update Status to
> **Accepted**, resolve `05-tech-stack.md` open question #3, and record the ratification in the
> decision log.
