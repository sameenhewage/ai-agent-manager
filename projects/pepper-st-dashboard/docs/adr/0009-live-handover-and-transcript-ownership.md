# ADR-0009 — Live WhatsApp Human Handover & Canonical Transcript Ownership

- **Status:** Accepted — **Phase 2 mandate**. Principles binding now; the
  control-plane **schema is deferred** to a Phase 2 schema proposal + migration
  gate. **Message duplication remains forbidden** unless a separate future ADR
  explicitly approves it.
- **Date:** 2026-06-15
- **Related:** ADR-0004 (read-only / no duplication), ADR-0008 (tenant/source +
  outbound contract), ADR-0005 (PII masking), ADR-0002 (multi-tenancy),
  ADR-0006 (retention), `docs/workflows/08-future-whatsapp-live-human-chat.md`,
  `docs/phases/roadmap.md`.

## Context

The business now **requires real live WhatsApp chat in Phase 2** (no longer a
Phase 4 "maybe"). When the AI bot **cannot complete a task**, it must **hand the
conversation over to a human operator**, who then drives the conversation from the
dashboard.

The human operator must be able to:

1. **See the conversation** (the live transcript, as today).
2. **Understand why the AI handed over** (a captured handover reason).
3. **Manually take the next action** (claim/own the conversation, pause the AI).
4. **Reply to the customer** through the **WhatsApp-connected dashboard**.

This introduces a **write path** (sending replies) for the first time, and a
strong temptation to start **storing messages** in the dashboard. That temptation
is the risk this ADR exists to control: a second, independent transcript source
would drift from the upstream record, break the read-only boundary (ADR-0004), and
duplicate PII. **Before any message tables are added, transcript ownership must be
defined.** This ADR defines it.

## Decision

### A. Live human handover is mandatory in Phase 2

1. **Promote** "WhatsApp live human chat + AI→human handover" from parked/Phase 4
   to **Phase 2 (mandatory)** (`roadmap.md`, `03-feature-scope.md`, Workflow 08).
2. **Handover trigger:** when the AI cannot complete a task it emits a **handover
   signal carrying a reason**; the conversation's control state flips to
   *human-requested* and the operator is alerted.
3. **Operator capabilities** (the four above) are first-class Phase 2 features for
   the Tenant Operator / Tenant Admin roles (`01-users-and-roles.md`).

### B. Canonical transcript ownership = the Agno / WhatsApp pipeline

4. **There is exactly ONE canonical transcript**, and it is **owned upstream** by
   the **Agno / WhatsApp pipeline**. The dashboard continues to render it **live,
   read-only** (ADR-0004 still holds in full). The dashboard does **not** become a
   transcript source.
5. **Human replies are persisted upstream, not by the dashboard.** To reply, the
   dashboard **calls the bot / WhatsApp Business API** (the outbound contract,
   ADR-0008); the **bot persists** the message into the canonical store; the
   dashboard then **re-reads it live** (Workflow 03). The dashboard is a **caller**
   of the send API, never a writer of `ai.*` and never the system of record for
   message content.

### C. Dashboard stores control-plane **metadata only**

6. The dashboard may store **handover / control / send-status metadata** keyed to
   a conversation — and **nothing that is message content**:
   - **Handover events** — reason, direction (AI→human / human→AI), actor, time.
   - **Conversation control / ownership** — who is currently handling (AI vs a
     specific human operator), paused/active, claimed-at.
   - **Outbound send status** — lifecycle of a dashboard-initiated reply
     (`queued | sent | delivered | read | failed`), the **provider/upstream
     message id**, error code, timestamps. It references the message by **id**, it
     does **not** copy the text.
7. **Human-vs-AI attribution in the rendered transcript** is derived by
   **correlating** canonical message ids/timestamps with this metadata — **not** by
   storing a separate copy of the message.

### D. No message duplication without a dedicated ADR

8. **Storing message bodies (including outbound human replies) in `dashboard.*` is
   forbidden** until a **separate, explicit ADR** approves it with a concrete
   justification. The only anticipated justification is: *the canonical pipeline
   cannot echo a dashboard-sent reply back into the transcript* (so the reply would
   otherwise be invisible). The **preferred fix is the outbound contract** (ADR-0008)
   guaranteeing echo-back; duplication is the **fallback of last resort** and needs
   its own ADR, retention rules, and PII treatment.

### E. Schema is deferred to a gate

9. The control-plane tables in (6) are **metadata-only** and are **not** added now.
   Their DDL is authored in a **Phase 2 schema proposal** and applied behind a
   **separate migration approval gate** (same discipline as Phase 1 — Drizzle
   schema + migrations matching a reviewable SQL proposal). **No tables are added
   by this ADR.**

## Consequences

- **Single source of truth preserved:** no transcript drift, no sync jobs, no PII
  re-storage; ADR-0004 stays intact.
- **New control plane (metadata):** Phase 2 gains handover/ownership/send-status
  tables, all tenant-scoped (ADR-0002), masked (ADR-0005), and retention-aware
  (ADR-0006) — defined later behind a gate.
- **Hard dependencies:** Phase 2 live chat needs (a) **auth & roles**, (b) the
  **outbound + pause/resume contract** with the bot/WhatsApp layer (ADR-0008), and
  (c) a **handover-signal contract** (how the AI says "I can't, with this reason").
- **Boundary unchanged:** the dashboard still **never writes `ai.*`**; it calls the
  bot's API and re-reads.
- **Failure modes to design for:** send failures, the WhatsApp 24-hour session
  window, double-reply races (AI + human) — handled via control/ownership state,
  not by duplicating data.

## Alternatives considered

- **Dashboard keeps its own messages table for replies:** rejected as the default —
  creates a second independent transcript, drifts from upstream, re-stores PII, and
  breaks ADR-0004. Permitted only via a future ADR if echo-back proves impossible.
- **Write replies directly into `ai.agno_*`:** rejected — violates upstream
  ownership and the read-only boundary; we do not own that schema.
- **Keep live chat parked to Phase 4:** rejected — it is now a Phase 2 business
  mandate.
- **Mirror the full transcript into the dashboard for performance:** rejected (same
  as ADR-0004); revisit only with a proven need under its own ADR.

## Action required (Phase 2)

- Agree the **outbound + pause/resume + handover-signal contract** with the AI-bot
  team; pin its exact shape in Workflow 08 and ADR-0008.
- Author the **Phase 2 control-plane schema proposal** (handover events,
  conversation control, outbound send status — metadata only) and put it behind a
  migration gate.
- Add **auth & roles** enforcement so only permitted operators can take over/reply.
