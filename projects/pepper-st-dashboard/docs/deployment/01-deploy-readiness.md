# Deploy Readiness Report — Gate 9

- **Project:** pepper-st-dashboard
- **App:** `base-dashboard-app/` (Next.js 15 App Router · TypeScript · Drizzle/`pg` · PostgreSQL)
- **Gate:** 9 — Deploy Readiness / Deploy Target Decision (**decision gate, not a deploy**)
- **Date:** 2026-06-15
- **Status:** ✅ **READY to choose/deploy after approval** (no blockers). Nothing deployed; no
  production migration/seed run; `ai.*` untouched.
- **Related:** `docs/adr/0010-deployment-target.md` (Proposed), `docs/architecture/05-tech-stack.md`
  (open question #3 = deploy target), `docs/phases/phase-1.md` (Gate 8 PASS),
  `docs/changelog/technical-decision-log.md` (TD-063).

> Scope boundary (locked): this dashboard **monitors/reads only**. It does **not** send WhatsApp
> messages or AI replies — those stay in the external AI platform/pipeline (CONTEXT §2, ADR-0004/0009).
> Gate 9 changed **no app code** and added **no features**.

---

## 1. Runtime shape (the facts that drive the decision)

| Route | Render | Per-request work |
|---|---|---|
| `/` (Dashboard) | `ƒ Dynamic` (`force-dynamic`) | reads analytics aggregate + masked recent list; parses 13 transcripts in memory |
| `/analytics` | `ƒ Dynamic` | same analytics aggregate, tz-aware ranges, retention clamp |
| `/chat-monitor` | `○ Static` shell | client lazily calls the two API routes below |
| `/api/chat-monitor/conversations` | `ƒ Dynamic`, `no-store` | cheap list (turn count via `jsonb_array_length`) — no transcript parsing |
| `/api/chat-monitor/conversations/[id]/transcript` | `ƒ Dynamic`, `no-store` | parses **one** tenant/channel-scoped session (IDOR-safe) |

- **DB access** (`lib/db/client.ts`): a lazily-created **singleton `pg` Pool** (`getPool()`), built from
  `DATABASE_URL` only. **No explicit `ssl` and no `max`** → SSL is whatever the URL specifies; pool
  size defaults to 10 **per process**. Importing `pg` keeps this module **server-only** (a client
  import would fail the build); `getPool`/`getDb` are imported by **no** client component (verified).
- **Same database as Agno.** The app connects to the Postgres that also hosts read-only
  `ai.agno_sessions`; it owns the `dashboard` schema and reads `ai.*`. `drizzle.config.ts` sets
  `schemaFilter: ["dashboard"]`, so `drizzle-kit` can never touch `ai.*`.
- **Implication:** a **single long-running Node process** (warm, bounded pool, private DB networking)
  fits this code as-written; a **serverless** target (per-invocation pools against a shared PII DB)
  needs a pooler + pool tuning before it is safe.

---

## 2. Deployment options compared

| Axis | **Self-host (VPS / Docker / Node `next start`)** | **Vercel (serverless)** |
|---|---|---|
| Next.js App Router | Full support (`next build && next start`) | First-class (native) |
| PostgreSQL connectivity | Can run on the **same host/VPC** as Agno PG → private, low-latency | Must reach PG over the public internet/tunnel (TLS) |
| Long-running DB conns / pooling | **Ideal** — one warm singleton pool, bounded | Per-invocation pools → connection churn on a **shared** DB unless PgBouncer/pooler + `max:1` |
| Environment variables | `.env` / systemd / compose / Docker secrets | Project env UI (good) |
| Production build/start | `next build` → `next start` (proven locally) | Git push → managed build |
| Cost / ops complexity | Low $ (often the box already runs the bot); **you own** TLS + process mgr + logs | Near-zero ops; managed TLS/CDN; **add** a pooler |
| Demo reliability | High — warm process, no cold starts, no public DB exposure | High DX, but cold starts add to the ~1–3s dynamic pages + DB-exposure risk |
| Future tenant growth | Scale vertically now; add rollup + PgBouncer + replicas later | Scales horizontally, but amplifies the pooling problem until rollup lands |

**Documented preference:** none yet — `05-tech-stack.md` open question #3 explicitly defers
"Vercel-style vs self-host" to this gate.

**Decisive factor:** the dashboard's DB is the **existing Agno Postgres** and it holds **PII**
(WhatsApp phone numbers are the `session_id`s). The lowest-risk topology keeps that DB **private** and
the pool **warm/bounded** → **self-host adjacent to the existing AI infrastructure**.

---

## 3. Recommendation

- **Demo →** **Self-hosted long-running Node**: `next build && next start` (optionally a small Docker
  container) on the **same host / private network as the Agno Postgres**, behind a TLS reverse proxy
  (Caddy/Nginx). Warm singleton pool, no public DB exposure, matches the code's assumptions. *(If a
  zero-ops public URL is required AND the DB can be safely exposed over TLS behind a pooler, Vercel is
  an acceptable fallback — but it is not the recommendation given the PII DB.)*
- **Production later →** Same model, **hardened**: containerized (`output: 'standalone'` Docker) on the
  Agno **private network/VPC**, TLS reverse proxy, a **dedicated read-only DB role for `ai.*`**
  (tech-stack §Security already recommends this), **explicit pool SSL + bounded `max`**, **PgBouncer**
  if horizontally scaled, the deferred **analytics rollup** before onboarding many tenants, and **real
  auth** replacing the `DEMO_TENANT_SLUG` resolver.

Demo and production deliberately share **one** model so the demo exercises the real production
topology (no "works on Vercel, breaks on the VPS" surprise).

---

## 4. Required environment variables

| Var | Required | Where used | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | server only (`lib/db/client.ts`, `drizzle.config.ts`, scripts) | Postgres conn string for the shared Agno+dashboard DB. **Secret** — gitignored, never printed (logs mask it via `maskDbUrl`). Append `?sslmode=require` for any remote/managed PG. |
| `DEMO_TENANT_SLUG` | No (default `pepper-st`) | server only (`lib/tenant/context.ts`) | Temporary auth stand-in; resolves the single demo tenant. |
| `PORT` | No | platform / `next start -p` | Process port. |

- **No `NEXT_PUBLIC_*` variables exist** → nothing secret is shipped to the browser. Confirmed: only
  `DATABASE_URL`, `DEMO_TENANT_SLUG`, and `CI` (Playwright-only) appear in `process.env` usage.
- **DATABASE_URL scheme note:** the dev value uses a SQLAlchemy-style `postgresql+psycopg://…` scheme
  (shared with the Python AI pipeline). `node-postgres` ignores the `+psycopg` suffix and reads
  host/port/user/password/db, so it works; a plain `postgres://…` works identically. Document whichever
  is used for the deploy; do not commit it.
- **DB privileges** the running web app needs at runtime: `SELECT` on `ai.agno_sessions` and
  `SELECT` on `dashboard.*`. Write privileges on `dashboard.*` are only needed by the **operator
  scripts** (migrate/seed/sync), not by request handling.

---

## 5. Database / migration / seed readiness

- **Provider:** existing PostgreSQL shared with Agno (not a new DB). The dashboard adds only the
  `dashboard` schema (6 `app_*` tables).
- **SSL:** **not enforced in code** — URL-driven. Add `?sslmode=require` (or a pool `ssl` block) for
  any networked/managed PG. (Fine to omit only for a co-located/private-socket demo DB.)
- **Pooling:** singleton `pg` Pool, default `max` 10 — correct for one long-running process; needs a
  pooler/`max:1` for serverless.
- **Script safety (all in `package.json`):**
  - **Read-only / safe:** `db:verify`, `db:chat:verify`, `db:analytics:verify`, `db:agno:verify`,
    `db:agno:inspect` (SELECT-only), `db:generate` (offline SQL gen).
  - **Writes `dashboard.*` only — require approval:** `db:migrate` (DDL, `dashboard` schema only),
    `db:seed` (idempotent upsert), `db:agno:sync` (reads `ai.*`, writes mapping rows).
  - **No destructive operations exist anywhere** (no `DROP`/`TRUNCATE`/`DELETE`; never writes `ai.*`).
- **Apply process for a fresh deploy DB (operator, after approval):**
  `DATABASE_URL=… npm run db:migrate` → `npm run db:seed` → `npm run db:agno:sync` → `npm run db:verify`.
- **Seed status:** PEPPER ST. tenant + `whatsapp-main`/`concierge` channel + enterprise/unlimited
  entitlement are already seeded on the current dev DB, with 13 conversations mapped (Gate 8 verified).
  A brand-new prod DB would need the apply process above.
- **Backup/restore:** `dashboard.*` is **fully regenerable** from `ai.*` (migrate + seed + sync), so
  dashboard data loss is low-impact. `ai.*` is the **system of record** and must be backed up by the
  **AI platform**, not this dashboard.

---

## 6. Runtime / security boundary confirmation

- **`ai.agno_*` read-only** — every access is `SELECT` (analytics + chat-monitor services, verify
  scripts); no `INSERT/UPDATE/DELETE` into `ai.*` anywhere.
- **No WhatsApp sending / no AI reply sending** — no `sendMessage`/`twilio`/`graph.facebook`/`wa.me`/
  `axios`/`node-fetch`/outbound code exists; every `whatsapp` reference is a label, the channel
  mapping, a token, or a comment. Client `fetch()` only hits this app's own read endpoints.
- **No DB writes during readiness checks** — only `typecheck`/`test`/`build`/`start` + read-only page
  renders were run; no migrate/seed/sync.
- **No fake metrics** — Dashboard presenter `FORBIDDEN_METRIC_KEYS` guard + test; analytics
  only-real-keys (Gate 8 `db:analytics:verify`).
- **No transcript duplication** — transcripts render live; there is no message table; `dashboard.*`
  stores mapping + timing only.
- **PII** — contacts masked everywhere (`94•••••297`); `DATABASE_URL` masked in logs; no secret in the
  client bundle.

---

## 7. Risk register (Gate 8 minors + Gate 9 findings)

| # | Risk | Before demo deploy | After demo (defer) | Before real client production |
|---|---|---|---|---|
| 1 | Cross-tenant isolation not demonstrated live (single seeded tenant) | — | defer | **Must fix** — seed a 2nd tenant + isolation e2e |
| 2 | Dashboard/Analytics parse transcripts per request | — | defer (fine at 13) | **Must fix** at scale |
| 3 | Analytics rollup deferred | — | defer | **Must fix** before multi-tenant scale |
| 4 | Zod in locked stack but not installed (pure-TS validation used) | — | defer | Reconcile: install Zod **or** amend ADR-0001 |
| 5 | Favicon 404 (only console error) | **Fix** (trivial, demo-facing) | — | fixed |
| 6 | DB SSL URL-only; pool has no explicit `ssl`/`max` | **Fix if DB is remote** (`?sslmode=require`) | defer if co-located/private | **Must fix** — enforce TLS + bound pool |
| 7 | No `output: 'standalone'` / Dockerfile | — | defer (`next start` works) | Add for a lean container image |
| 8 | No dedicated health endpoint | — | defer (use `/`) | Add `/api/health` (liveness) |
| 9 | `DEMO_TENANT_SLUG` = temporary auth stand-in | — | defer | **Must fix** — real auth/tenant selection |
| 10 | Security headers / HTTPS redirect not in-app | — | defer (reverse proxy) | Enforce at proxy (HSTS, etc.) |

None of the above is a Gate 9 **blocker**; items 5/6 are the only ones touching the demo, and both are
config-level (no feature work).

---

## 8. Deployment checklist (execute only after explicit approval)

**Environment**
- [ ] Provision `DATABASE_URL` (secret) on the target; for remote/managed PG append `?sslmode=require`.
- [ ] Set `DEMO_TENANT_SLUG=pepper-st` (or leave unset for the default).
- [ ] Confirm **no** `NEXT_PUBLIC_*` secrets are added.

**DB access**
- [ ] Network path from the app host to Postgres is **private** (same host/VPC) or TLS-enforced.
- [ ] (Prod) create a **read-only role** for `ai.*`; grant `dashboard.*` read at runtime.

**Migration / seed plan** (operator, approved)
- [ ] `npm run db:migrate` (creates `dashboard` schema only) → `npm run db:verify` (read-only).
- [ ] `npm run db:seed` (idempotent PEPPER ST. tenant/channel/entitlement).
- [ ] `npm run db:agno:sync` (map real Agno sessions → `dashboard` conversations) → `npm run db:verify`.

**Build / start**
- [ ] Build: `npm ci && npm run build` (Node ≥ 20; `.nvmrc` pins 20).
- [ ] Start: `npm run start -- -p <PORT>` (or Docker `next start`).
- [ ] Front with a TLS reverse proxy (Caddy/Nginx).

**Health / smoke (post-start)**
- [ ] Liveness: `GET /` returns 200 (or add `/api/health`).
- [ ] Smoke URLs: `/` (Dashboard KPIs render), `/chat-monitor` (list + one transcript), `/analytics`
  (KPIs + 2 charts; switch a range).
- [ ] Read-only data check: `npm run db:chat:verify` + `npm run db:analytics:verify` = ALL PASS.

**Rollback**
- [ ] App: redeploy the previous build/image (stateless web tier).
- [ ] DB: no rollback needed for reads; `dashboard.*` is regenerable (migrate+seed+sync). **Never**
  drop/alter `ai.*`.

**Logs to inspect**
- [ ] App stdout/stderr (Next server): request errors, masked `DATABASE_URL` line on boot.
- [ ] Reverse-proxy access/error logs.
- [ ] Postgres: connection count / slow queries (watch pool saturation on the shared DB).

---

## 9. Gate 9 verdict

✅ **PASS — ready to choose/deploy after approval.** Recommended target: **self-hosted long-running
Node/Docker adjacent to the Agno Postgres** for both demo and (hardened) production. No blockers; the
only demo-touching items are the favicon (trivial) and SSL-in-URL (only if the demo DB is remote).
**Do not deploy, migrate, or seed any production DB without explicit approval.**
