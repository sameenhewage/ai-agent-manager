# 04 — Feature Impact Map (Gate 10)

- **Date:** 2026-06-16
- **Purpose:** map the *current* database to product features. **Data existing ≠ feature approved.**
  Product *possibility* is documented separately from *approved scope*. Phase 1 scope is unchanged
  (see `docs/product/03-feature-scope.md`); nothing here authorises new features.

---

## A. Current Phase 1 features

| Feature | Reads | Current state vs migrated DB | What it needs to work again |
|---|---|---|---|
| **Chat Monitor** | `app_conversations` + `ai.agno_sessions.runs` (transcript) | **Broken** — lists 13 stale conversations; transcripts resolve **empty** (0 turns) because no session matches `agent_id='concierge'` | Correct agent + session mapping, then re-sync; parser itself is fine |
| **Analytics** | mapped conversations + `runs` + `session_metrics` | **Broken** — reports 13 conversations but 0 turns/messages/tokens/cost (`db:analytics:verify` FAILs: live=13 vs sql=0) | Same re-mapping; token/cost JSON path still valid |
| **Dashboard** | analytics aggregate + recent conversations | **Broken** — KPIs collapse to zero (mirrors Analytics) | Same re-mapping |

The application **code/parser is intact** (typecheck clean, 106/106 unit tests pass). The breakage is
a **data-contract drift**, not a code regression — the fix is re-mapping (config + sync), not a rewrite.

## B. Future *possible* features (NOT approved — possibility only)

| Possible feature | Useful tables/fields | Missing / caveats | Read-only? | Needs dashboard-owned tables? | Scope |
|---|---|---|---|---|---|
| **Human handover / approvals monitoring** | `ai.agno_approvals` (`status`, `pause_type`, `run_id`, `session_id`) | empty now; semantics unconfirmed | Yes | No (read) | Out of Phase 1 |
| **Per-run model & cost analytics** | `runs[].model`, `runs[].model_provider`, `runs[].metrics`, `session_metrics.{input,output,cache,reasoning}_tokens` | needs richer parsing | Yes | Maybe (rollup) | Out of Phase 1 (enhancement) |
| **Platform daily metrics** | `ai.agno_metrics` (`date`, `token_metrics`, counts) | **empty**; agent/team scoped, **not tenant/channel scoped** | Yes | Likely (tenant rollup) | Out of Phase 1 |
| **Customer profiles / memory** | `ai.agno_memories` (`memory`, `input`, `topics`, `user_id`) | **PII-heavy**; 1 row; needs strict masking + access control | Yes | Maybe | Out of Phase 1 (sensitive) |
| **AI knowledge-base visibility** | `ai.agno_knowledge` (name/type/size/status; 32 rows) | business-confidential; no customer value yet | Yes | No | Out of Phase 1 |
| **Scheduled-job / automation status** | `ai.agno_schedules`, `ai.agno_schedule_runs` | empty | Yes | No | Out of Phase 1 |
| **Product / order visibility** | — | **No order/product entity in `ai.*`**; only appears inside message/tool content | n/a | Yes (own tables) + integration | Out of scope (parked, ADR/scope) |
| **Follow-ups / issues / leads** | — | no reliable structured source in `ai.*` | n/a | Yes | Out of scope (parked) |

## C. Reliability notes

- **Reliable, structured, read-only:** sessions, runs, messages, `session_metrics`, `agno_metrics`
  (once populated), `agno_approvals`, `agno_knowledge`.
- **Sensitive (PII):** `agno_sessions.user_id` + `runs[].messages[].content` + `agno_memories` +
  `agno_learnings`. Any feature touching these must mask and must never persist raw values.
- **Not present anywhere in `ai.*`:** orders, exchanges, complaints, CSAT, sentiment, intent,
  resolution status, revenue. These remain unsupported in Phase 1 (ADR-0007 "real data only").

## D. Takeaway

The migration **expands future possibility** (handover/approvals, per-run model analytics, daily
rollups, knowledge visibility) but **breaks the three current features today** until the mapping is
corrected. No scope change is implied or approved by this document.
