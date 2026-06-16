# V2 / 02 — Relationships & Data Flow

> All links below are **by value** across schemas (there is **no foreign key into
> `ai.*`**). FK-backed links exist only *within* the `dashboard` schema. Cross-schema
> links labelled **CONFIRMED** were verified by read-only `count(*)` joins on
> 2026-06-16; links labelled **TO VERIFY** are unproven.

## Confirmation evidence (read-only counts, PII-free)

| Check | Join | Result |
|---|---|---|
| R1 | `app_conversations ⋈ ai.customers` on `(tenant_id::text, channel_id::text, external_contact_id) = (tenant_id, channel_id, phone)` | **6 matched** → CONFIRMED |
| R2 | `app_conversations ⋈ ai.agno_sessions` on `agno_session_id = session_id` | **4 matched** → CONFIRMED (active/live subset) |
| R3 | `ai.agno_sessions ⋈ ai.customers` on `user_id = phone` | **5 matched** → CONFIRMED |
| R4 | `ai.agno_sessions.agent_id = (tenant_id::text || ':' || channel_id::text)` | **6 matched** → CONFIRMED (agent_id format) |
| R5 | `app_conversations` totals | 17 conversations, 15 distinct contacts |

---

## A. Database relationship map

Legend: solid = **FK** (within `dashboard`); dashed = **by-value** link (cross-schema,
no FK). Entity names use `_` for the schema dot (e.g. `ai_agno_sessions` =
`ai.agno_sessions`).

```mermaid
erDiagram
    dashboard_app_tenants ||--o{ dashboard_app_channels : "tenant_id (FK)"
    dashboard_app_tenants ||--o{ dashboard_app_conversations : "tenant_id (FK)"
    dashboard_app_channels ||--o{ dashboard_app_conversations : "channel_id (FK)"
    dashboard_app_tenants ||--|| dashboard_app_tenant_entitlements : "tenant_id (FK, 1:1)"

    dashboard_app_conversations }o..|| ai_agno_sessions : "agno_session_id = session_id (by value, CONFIRMED R2)"
    dashboard_app_conversations }o..o| ai_customers : "(tenant,channel,external_contact_id) = (tenant_id,channel_id,phone) (by value, CONFIRMED R1)"
    ai_agno_sessions }o..o| ai_customers : "user_id = phone (by value, CONFIRMED R3)"

    dashboard_app_tenants {
        uuid id PK
        text slug UK
        text timezone
    }
    dashboard_app_channels {
        uuid id PK
        uuid tenant_id FK
        text channel_key
        text display_name
    }
    dashboard_app_conversations {
        uuid id PK
        uuid tenant_id FK
        uuid channel_id FK
        text agno_session_id "= ai.agno_sessions.session_id"
        text external_contact_id "masked on read"
        text status
        timestamptz last_at
    }
    dashboard_app_tenant_entitlements {
        uuid id PK
        uuid tenant_id FK
        int raw_history_retention_days "NULL = unlimited"
        int analytics_retention_days "NULL = unlimited"
    }
    ai_agno_sessions {
        varchar session_id PK
        varchar agent_id "= tenantId:channelId (CONFIRMED R4)"
        varchar user_id "= phone (PII)"
        jsonb runs "transcript"
        jsonb session_data "session_metrics.total_tokens / cost"
        bigint updated_at "epoch s"
    }
    ai_customers {
        text tenant_id PK
        text channel_id PK
        text phone PK "PII"
        text name "nullable; 5/5 populated"
    }
```

**Derived (not a column link):** `ai.agno_sessions.agent_id = "<tenant_id>:<channel_id>"`
(tenant-first), derived from the dashboard's own `app_tenants.id` + `app_channels.id`
(`lib/agno/mapping.ts::deriveExpectedAgentId`). CONFIRMED (R4 = 6/6).

**`ai.agno_metrics` — relationship TO VERIFY.** Table is **empty (0 rows)**, so no
row-level link can be observed. *Expected* link would be by `date` (+ `aggregation_period`)
and an agent/tenant key — **TO VERIFY** with the AI dev once it is populated. It is **not**
drawn above because no relationship is confirmed.

---

## B. App request flow (Browser → … → safe DTO → UI)

```mermaid
flowchart LR
    UI["Browser (client component)"] -->|"GET /api/...?range="| RT["Next.js route handler<br/>app/api/*/route.ts"]
    RT --> EP["endpoint core<br/>lib/api/endpoints.ts<br/>(validate range, shape DTO)"]
    EP --> SVC["service layer<br/>lib/analytics/service.ts<br/>lib/chat-monitor/service.ts"]
    SVC -->|"Drizzle (dashboard) + pg SELECT (ai, read-only)"| DB[("PostgreSQL<br/>dashboard.* + ai.agno_sessions")]
    DB --> SVC
    SVC -->|"mask + aggregate (no raw PII)"| EP
    EP -->|"safe masked JSON"| RT
    RT -->|"{ analytics, recent } / { conversations } / { transcript }"| UI
    SSR["Server Component page<br/>app/(dashboard)/*/page.tsx"] -->|"initial paint calls services directly"| SVC
```

- **Tenant/channel are resolved server-side** in the services; the client query is read
  for `range`/`from`/`to` **only** (`lib/api/query.ts`). Any client-supplied tenant/channel
  id is ignored.
- **Initial paint is SSR** (the page calls the services directly); **subsequent filter
  changes are client `fetch`** to the API routes (ADR-0013).

---

## C. Chat Monitor flow (id → resolve session → runs → masked transcript)

```mermaid
flowchart TD
    L["List: GET /api/chat-monitor/conversations"] --> LS["getConversationList()"]
    LS --> LC[("dashboard.app_conversations<br/>(active, tenant+channel)")]
    LS --> LT[("ai.agno_sessions<br/>jsonb_array_length(runs) = turns")]
    LS --> LP["presenter: maskContactId + retention window"]
    LP --> LDTO["DTO: maskedContact, status, turnCount (NO bodies)"]

    T["Transcript: GET /api/chat-monitor/conversations/[id]/transcript"] --> TV{"UUID valid?<br/>tenant+channel owns id?"}
    TV -- no --> T404["return null → 404 (IDOR-safe)"]
    TV -- yes --> TR["read ai.agno_sessions.runs for that session_id<br/>(scoped by derived agent_id)"]
    TR --> TP["parseTranscript: drop role=system, drop from_history,<br/>drop tool (default), dedupe by id, order by created_at"]
    TP --> TM["apply retention cutoff + maskContactId"]
    TM --> TDTO["DTO: maskedContact + messages[sender,content,at] (never persisted)"]
```

Transcript **source = `ai.agno_sessions.runs`**, parsed **live in memory**, never stored
in `dashboard.*` (ADR-0004). See `05` for masking/IDOR detail.

---

## D. Analytics flow (range → aggregates → safe DTO)

```mermaid
flowchart TD
    F["Filter range (client)"] -->|"GET /api/analytics?range=&from=&to="| R["route → runAnalyticsEndpoint"]
    R --> Q["parseAnalyticsQuery (validate range / custom from<=to)"]
    Q --> S["getAnalyticsData()"]
    S --> RG["resolveRange (tenant tz) + clampToRetention"]
    S --> U[("dashboard.app_conversations<br/>active AND last_at in [from,to)")]
    U --> SID["collectSessionIds"]
    SID --> AG[("ai.agno_sessions WHERE session_id = ANY(ids)<br/>runs + session_metrics (read-only, PK lookup)")]
    AG --> BI["buildAnalyticsInputs (join by value, in memory)"]
    BI --> AGG["aggregateAnalytics: conversations, turns, messages,<br/>tokens, cost, new/returning, daily series"]
    AGG --> DTO["PII-free DTO: totals + series (no contact ids)"]
```

- **Universe grain = CONVERSATION/SESSION**, narrowed at the DB by the indexed
  `app_conversations.last_at`, then joined **by value** to `ai.agno_sessions` by
  `session_id` (PK).
- **Token/cost come from `session_data.session_metrics` (session lifetime totals)**, and
  the daily series buckets a whole conversation on its single `last_at` day — see `04` for
  why this makes date-sliced metrics approximate.
