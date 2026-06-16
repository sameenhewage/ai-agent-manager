# 05 — Risks & Recommendations (Gate 10)

- **Date:** 2026-06-16
- **Input:** `01-current-database-inventory.md`, `02-ai-platform-data-contract.md`,
  `03-dashboard-data-contract.md`, `04-feature-impact-map.md`.

---

## 1. Classified findings

### 🔴 Blocker — must fix before any deploy / demo

- **B1 — Agent identity changed (`'concierge'` → derived `<tenant_id>:<channel_id>`).**
  The channel resolves by the stored `source_agent_id='concierge'`, which matches **0** live sessions.
  *Confirmed fix:* the live `agent_id` is built from our own `app_tenants.id:app_channels.id`, so the
  dashboard must **derive** it (not store a literal). Label `PEPPER ST. WhatsApp Concierge` is only
  inside `runs[].agent_name`. → Until the derive-mapping lands, every surface joins to nothing.
- **B2 — Contact identity moved (`session_id` → `user_id`).**
  `session_id` is now a 32-char opaque token; the phone (PII) is in `user_id`. The mapping rule
  `external_contact_id == session_id` is invalid.
- **B3 — 13 orphan conversations / 0 live coverage.**
  *Example:* "Mapping coverage changed from 13/13 (Gate 9) to **0/1**; all 13 `app_conversations` are
  orphans." Deploying now would demo empty transcripts and zero KPIs.

> These three are one root cause (the Agno migration) and one fix path (re-map + re-sync). They are
> **not** code bugs — `typecheck` is clean and **106/106** unit tests pass.

### 🟠 Major — before Phase 2 (or before trusting current verifies)

- **M1 — Verify scripts give false confidence.** `db:agno:verify` and `db:chat:verify` reported
  **ALL PASS** despite empty transcripts (they check internal consistency, not live-session coverage).
  Only `db:analytics:verify` caught it (`live=13 sql=0`). Harden the verifies to assert live coverage.
- **M2 — Per-request transcript parsing still in place; `agno_metrics` rollups exist but are empty.**
  Not urgent at 1 session, but the daily-rollup table is now available as a future analytics source.
- **M3 — New PII surface.** `user_id` (phone) and `agno_memories`/`agno_learnings` content are new
  PII locations; ensure any future read path masks them.

### 🟡 Minor / can defer

- **m1 — Many empty `ai.*` tables** (components, schedules, evals, approvals) — ignore for Phase 1.
- **m2 — Stale planner stats** (`reltuples` off); cosmetic.
- **m3 — Carried from Gate 9:** Zod stack-alignment; favicon 404.

### 🟢 Opportunity / future enhancement

- **agno_metrics** daily rollups (token/model/run/session counts) — could back Analytics at scale.
- **agno_approvals** — human-handover/approval monitoring (read-only).
- **runs[].model / model_provider / metrics** + token splits — per-model cost analytics.
- **agno_knowledge** — KB coverage/status visibility.

---

## 2. Recommended data contract (consolidated)

| Concern | Canonical source (read-only) | Dashboard responsibility |
|---|---|---|
| Transcript | `ai.agno_sessions.runs[].messages[]` | parse in memory; never persist |
| Turn count | `jsonb_array_length(runs)` | — |
| Tokens / cost | `session_data.session_metrics.{total_tokens,cost,…}` | aggregate only |
| **Contact identity** | **`ai.agno_sessions.user_id`** (phone, PII) | store as `external_contact_id`; **always mask** |
| Agno session key | `ai.agno_sessions.session_id` (opaque) | store as `agno_session_id` |
| **Agent identity** | `agent_id` = **`${app_tenants.id}:${app_channels.id}`** (derived) | **derive** in the mapping seam (confirmed); `source_agent_id` legacy cache only |
| Analytics (now) | live parse of `runs` + `session_metrics` | per-request until rollup |
| Analytics (future) | `ai.agno_metrics` if tenant-scopable | materialise dashboard rollups if scale requires |
| Daily/long-term memory, learnings, knowledge | `agno_memories` / `agno_learnings` / `agno_knowledge` | **out of Phase 1**; PII-gated if ever used |

- **Dashboard owns:** tenant/channel/entitlement config, customer/identity/conversation mapping,
  conversation `status`, cached `first_at`/`last_at`.
- **AI platform owns:** everything in `ai.*` (system of record). **Must remain read-only.**
- **Materialise later:** per-tenant analytics rollups (only if scale demands; Phase 1 stays live-parse).

---

## 3. Recommended next step (requires explicit approval — not done in Gate 10)

A small follow-up slice ("Phase 1 re-alignment to Agno v2"), gated by approval:

1. **Confirmed (2026-06-16):** the agent key is **derived** `agent_id = "${app_tenants.id}:${app_channels.id}"`
   (tenant-first; live-verified) and `user_id` is the WhatsApp contact (PII).
2. Update the mapping seam to **derive** the agent key (drop hardcoded `'concierge'`) and source the
   contact from `user_id` (was `session_id`) — a small, reviewable change behind the existing seam.
3. Re-run `db:agno:sync` (dashboard-only write) and decide on clearing the 13 orphan rows.
4. Harden `db:agno:verify` / `db:chat:verify` to assert live-session coverage (catch future drift).
5. Re-run Gate 10 discovery + browser smoke to confirm real data returns.

**Until step 1–3 are approved and done, the dashboard must not be deployed/demoed** (it would show
empty data). See ADR-0011 (Accepted) for the identity-re-coupling decision.
