# Handoff — Stage 1 Analysis + Docs-first Bootstrap

- **Date:** 2026-06-15
- **Project:** pepper-st-dashboard
- **From:** Orchestrator/Discovery/Architect (analysis + documentation)
- **To:** next session (awaiting approval gates before build)

## What was done

1. **Stage 1 analysis** (read-only): inspected repo + AI-team docs, the Bloomwire
   UI prototype, and the live `ai.agno_sessions` database (3 read-only rounds,
   masked samples, no mutations).
2. **Docs-first bootstrap**: created the full `projects/pepper-st-dashboard/`
   documentation set encoding all locked decisions.
3. **Docs patch (2026-06-15):** locked the **tech stack** (Next.js + TS + Tailwind
   + shadcn/ui + Drizzle ORM + PostgreSQL + Zod; `pg` only as Drizzle's driver;
   shadcn restyled to match the demo) and applied six **schema-proposal
   corrections** (tenant lifecycle fields; `channel_key` uniqueness; source-mapping
   fields; `customer_identity_id`; `external_contact_id` indexed-not-unique;
   one subscription-limits row per tenant). Docs-only — still no code/migrations.
4. **Docs patch #2 (2026-06-15):** schema hardening + access semantics — added
   `updated_at` to `app_conversations`/`app_customers`; **CHECK** constraints
   (tenant `status`/`onboarding_status`, conversation `status`, retention `> 0`);
   **active + exactly-one** channel resolution (0 → unmapped, >1 → ambiguous +
   masked warning, never guess); retention as an **access limit** (Chat Monitor
   list + transcript; out-of-window → restricted/empty); Phase 1 **analytics capped
   by retention** (no rollup yet); seed documented as **one-time** with an
   idempotent upsert variant; PRD Gate 3 fixed to **locked**. Docs-only.
5. **Docs patch #3 (2026-06-15):** Phase 2 architecture decision — **ADR-0009**
   (live WhatsApp human chat + AI→human handover, **mandatory for Phase 2**) plus a
   rewritten **Workflow 08**. Established **canonical transcript ownership** (Agno/
   WhatsApp upstream; dashboard renders live and stores **handover/control/
   send-status metadata only**; **no message duplication** without a dedicated ADR).
   Promoted in the roadmap; reflected in feature-scope, roles, overview, CONTEXT.
   **No message tables added** — control-plane DDL deferred to a Phase 2 migration
   gate. Docs-only.
6. **Docs patch #4 (2026-06-15):** entitlement/timezone cleanup before Gate 2 —
   renamed `app_subscription_limits` → **`app_tenant_entitlements`** (the tenant's
   **current access config, not final pricing**; pricing parked), added `plan_code`
   / `is_fully_enabled` / **`analytics_retention_days`**, made retention **nullable
   (`NULL` = unlimited)** with `IS NULL OR > 0` CHECKs, seeded **PEPPER ST. =
   enterprise / fully enabled / NULL retention**, added **`app_tenants.timezone`**
   (default `Asia/Colombo`; drives Today/Month/Custom), fixed the relationship to
   **`1───1`**, and clarified the PRD conversation-`status` wording (no Agno-derived
   status; dashboard-owned `status` exists but defaults to `open`). Docs-only.
7. **Docs patch #5 (2026-06-15):** pre-build planning cleanup — **removed hidden
   entitlement defaults** (`plan_code`/`is_fully_enabled` now `NOT NULL` with no
   default = explicit at onboarding; retention columns no default, `NULL` =
   unlimited); **finalized analytics wording** in the roadmap (**raw access** =
   `raw_history_retention_days`, **analytics detail** = `analytics_retention_days`,
   `NULL` = unlimited); added **`docs/phases/phase-1-implementation-plan.md`**
   (Slices 0–7); and established **Subagent readiness as Gate 0** — the
   `.claude/{agents,workflows,templates,skills}` dirs are currently **empty**, so the
   AGENTS.md agents must be restored before any build. Docs-only.
8. **Gate 0 executed (2026-06-15) — PASS.** Verified the **7 global agents** in
   `.claude/agents/` are present & usable (the earlier "empty dirs" finding was
   **stale**). Created **project-scoped** coordination under
   `projects/pepper-st-dashboard/docs/`: `agents/` (README roster + slice ownership +
   `agent-boundaries.md`), `workflows/` (gate-0, phase-1-slice, schema-migration-review,
   qa-handoff), and `templates/` (slice-plan, slice-handoff, qa-report,
   migration-proposal). **No global agents duplicated or modified;** global `.claude/`
   kept generic. Skills **parked** (global `.claude/skills/` empty; optional). Docs-only.

## Files changed (created)

- `CONTEXT.md`, `README.md`
- `docs/product/00-product-vision.md` … `04-prd-first-slice.md` (5)
- `docs/architecture/00-overview.md`, `01-data-model.md`,
  `02-schema-proposal.sql.md` *(reviewable SQL, NOT applied)*,
  `03-agno-mapping.md`, `04-multitenancy.md`, `05-tech-stack.md`
- `docs/adr/0001…0009` (9 ADRs; 0009 = live handover + transcript ownership)
- `docs/workflows/01…09` (9 workflows; 08 = live human chat, now Phase 2)
- `docs/phases/phase-1.md`, `docs/phases/phase-1-implementation-plan.md`,
  `docs/phases/roadmap.md`
- `docs/changelog/technical-decision-log.md`
- `docs/handoff/2026-06-15-stage-1-bootstrap.md` (this file)

**No application code. No migrations applied. No DB changes. `ai.agno_*` untouched.**

## Tests run

- None (documentation only; no code in this phase). Test **intent** is captured in
  `docs/product/04-prd-first-slice.md` and each workflow's "Test intent".

## Key grounding facts (from DB inspection)

- `ai.agno_sessions.session_id` = WhatsApp phone (varchar **PK**, global).
- `created_at`/`updated_at` = **epoch seconds**; `metadata` + `summary` = **NULL**.
- Transcript lives in `runs[].messages[]`; `system` repeats per run;
  `from_history` present (all false now) → dedupe by `id`.
- `session_data.session_metrics` has real token/cost data.
- Demo: 11 sessions, single agent `concierge`.

## Locked decisions (see technical-decision-log.md TD-001…TD-043)

Read-only over Agno · separate `dashboard` schema + `app_` prefix · tenancy from
day one · one rolling conversation per phone · real-data-only Phase 1 · PII
masking default · query-level retention via **entitlements** (`NULL` = unlimited) ·
future tenant/source contract ·
**stack locked (Drizzle/shadcn/Zod)** · **schema corrections (channel_key,
customer_identity_id, non-unique contact id, single limits row, tenant lifecycle)** ·
**schema hardening (updated_at, CHECKs)** · **active+exactly-one channel
resolution** · **retention = access limit (list+transcript)** · **analytics detail
capped by `analytics_retention_days`** · **Phase 2 live human handover (ADR-0009): one canonical transcript
upstream, dashboard metadata-only, no message duplication** · **entitlements rename
(`app_tenant_entitlements`) + `analytics_retention_days` + tenant `timezone`; `NULL`
retention = unlimited, PEPPER ST. = enterprise** · **no hidden entitlement defaults
(explicit insert)** · **Phase 1 implementation plan (Slices 0–7) + Subagent readiness Gate 0
(executed → PASS; global agents reused, project-scoped coordination)**.

See `changelog/technical-decision-log.md` (TD-001…TD-043) for the full list.

## Risks / watch-list

- **R1** Phone-only global `session_id` is unsafe for multi-tenant prod → ADR-0008
  contract required before a 2nd WhatsApp tenant.
- **R2** Prototype shows far more than Agno provides → strictly hide unsupported
  surfaces (ADR-0007).
- **R3** Transcript correctness depends on dedupe/system-exclusion (test first).
- **R4** Bloomwire branding/sample data must not leak into PEPPER ST. as real.
- **R5** shadcn/ui must be **restyled** to the demo tokens; the default theme must
  not override the demo look (UI must match the prototype closely).
- **R6** Overlapping `app_channels` source-mapping → **ambiguous** resolution; the
  mapper skips + logs (masked) and never guesses. Keep channel configs disjoint.
- **R7** Phase 2 live chat introduces a **write path** + a temptation to store
  messages. Mitigated by ADR-0009 (metadata-only; canonical transcript upstream).
  **Hard dependency:** the bot/WhatsApp **outbound + pause/resume + handover-signal
  contract** (ADR-0008) and **auth** must land first.

## Open gates (blocking build)

- **Gate 0 — Subagent readiness:** ✅ **PASS (2026-06-15).** Global agents present &
  usable; PEPPER ST. coordination created under `docs/{agents,workflows,templates}`;
  skills parked. See `docs/agents/README.md`.
- **Gate 2 — Schema migration approval:** ⛔ pending. Author the **Drizzle schema**
  to match `02-schema-proposal.sql.md`; **propose** migrations (apply only after
  approval).
- **Gate 3 — Tech stack:** ✅ **locked** (`05-tech-stack.md`). Deploy target still open.
- **Gate 4 — Per-slice QA + docs/handoff:** per slice.

## Recommended next step

1. **Gate 0 — ✅ done (PASS).** Global agents verified; PEPPER ST. coordination created.
2. **Next — Slice 1:** Next.js **app shell + UI foundation** (demo tokens;
   sidebar/topbar/dashboard shell; **no DB logic**). Lead: `fullstack-builder-agent`.
3. **Slice 2:** **Drizzle schema / migration proposal** (matches
   `02-schema-proposal.sql.md`; proposed, **not applied**).
4. **Only after Gate 2 approval — Slice 3:** apply the migration + seed PEPPER ST. /
   WhatsApp / `concierge` (explicit enterprise / unlimited entitlement).

See `docs/phases/phase-1-implementation-plan.md` for the full slice plan and
`docs/agents/README.md` for slice ownership.
