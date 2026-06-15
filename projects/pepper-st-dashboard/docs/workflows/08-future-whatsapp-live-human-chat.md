# Workflow 08 — WhatsApp Live Human Chat & AI→Human Handover

- **Status:** **Phase 2 (mandatory)** — design (not built in Phase 1)
- **Last updated:** 2026-06-15
- **Related:** ADR-0009 (handover + transcript ownership), ADR-0004 (read-only /
  no duplication), ADR-0008 (outbound/identity contract), ADR-0005 (PII),
  ADR-0002 (tenancy), ADR-0006 (retention)

## Goal

When the AI bot **cannot complete a task**, hand the conversation to a **human
operator** who can **see it**, **understand why**, **take the next action**, and
**reply to the customer on WhatsApp** from the dashboard — **without** creating a
second transcript source.

## Canonical transcript ownership (read first — ADR-0009)

- The **Agno / WhatsApp pipeline owns the one canonical transcript.** The dashboard
  renders it **live, read-only** (Workflow 03 / ADR-0004) — before, during, and
  after handover.
- The dashboard stores **control-plane metadata only** (handover, ownership, send
  status). **No message bodies** are stored in `dashboard.*` (ADR-0009 §D).
- To reply, the dashboard **calls the bot / WhatsApp API**; the **bot persists** the
  message; the dashboard **re-reads** it live. The dashboard never writes `ai.*`.

## Handover model

```
AI handling ──(AI cannot complete: emits handover reason)──► HUMAN REQUESTED
   ▲                                                              │
   │                                          operator claims / "Take over"
   │                                                              ▼
   └────────────("Resume AI": human→AI, logged)────────────  HUMAN HANDLING
                                                            (AI paused for session)
```

- **Handover (AI→human):** the AI emits a **signal + reason** ("can't complete task
  X", "customer asked for a human", low confidence, …). The conversation's **control
  state** becomes *human-requested* and the operator is alerted.
- **Take over (operator):** the operator **claims** the conversation (becomes owner)
  and the **AI is paused** for that session (via the bot API) so AI and human never
  both reply.
- **Reply:** the operator sends a WhatsApp message **via the dashboard → bot API**;
  send status is tracked (below); the reply appears in the live transcript once the
  pipeline echoes it back.
- **Resume (human→AI):** the operator hands control back; the event is logged.

## Operator capabilities (the four requirements)

1. **See the conversation** — the existing live transcript (masked, retention-aware).
2. **Understand the handover reason** — shown from the captured handover event.
3. **Take the next action** — claim/own, pause AI, mark resolved, resume AI.
4. **Reply on WhatsApp** — compose + send through the WhatsApp-connected dashboard.

## Dashboard-owned metadata (CONCEPTUAL — DDL deferred to the Phase 2 schema gate)

Metadata only; **no message text**. Final tables/columns are authored in a Phase 2
schema proposal behind a migration gate (ADR-0009 §E):

- **Handover events** — `conversation_id`, reason, direction (AI→human /
  human→AI), actor, `created_at`.
- **Conversation control / ownership** — current handler (AI vs operator id),
  `state` (`ai_active` / `human_requested` / `human_active` / `resolved`),
  `claimed_at`, `updated_at`.
- **Outbound send status** — `conversation_id`, **upstream/provider message id**,
  `status` (`queued`/`sent`/`delivered`/`read`/`failed`), error code, timestamps.
  References the message by **id**; **does not** store the body.

> Human-vs-AI **attribution** in the rendered transcript is derived by correlating
> canonical message ids/timestamps with this metadata — **never** by copying text.

## Send path

```
"Take over"  → dashboard → bot API: pause AI for session  → control = human_active
type reply   → dashboard → bot API: send WhatsApp message → record send-status (queued→sent…)
               bot persists message into the canonical store (ai.agno_*)
               dashboard re-reads transcript live (Workflow 03)
"Resume AI"  → dashboard → bot API: resume                → control = ai_active (logged)
```

## Prerequisites before building

1. **Auth & roles** (Tenant Operator/Admin) — `docs/product/01-users-and-roles.md`.
2. **Outbound contract** (ADR-0008): APIs to **send** a message and to
   **pause/resume** the AI per session, with **delivery callbacks**.
3. **Handover-signal contract**: how the AI emits "cannot complete + reason".
4. **Tenant/source contract** (ADR-0008) so a reply routes to the right
   business/channel/number unambiguously.
5. **Phase 2 control-plane schema** (metadata-only) approved at its migration gate.

## Open questions (resolve with the bot team)

- Exact handover-signal shape + reason taxonomy.
- Does the bot expose pause/resume + send + delivery-receipt APIs? Auth model?
- Does the pipeline **echo dashboard-sent replies** back into the canonical
  transcript? If **not** → triggers the message-duplication ADR (ADR-0009 §D).
- WhatsApp **24-hour session window** + rate-limit handling.

## Non-negotiables carried forward

- **Never** mutate `ai.agno_*`; the dashboard calls the bot API and re-reads.
- **Never** store message bodies in `dashboard.*` without a dedicated ADR (ADR-0009).
- **One** canonical transcript (upstream); the dashboard holds **metadata only**.
- Mask PII (incl. outbound content in logs); stay tenant-scoped; stay retention-aware.
