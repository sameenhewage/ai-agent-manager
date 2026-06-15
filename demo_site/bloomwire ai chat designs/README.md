# Bloomwire — AI Chat Operations Dashboard

A high-fidelity, clickable SaaS dashboard prototype for a fashion/clothing brand
(**Bloomwire**) that uses an **AI chatbot** for customer conversations on WhatsApp.

> The AI bot talks to customers. **This dashboard turns those chats into trackable
> business operations.**

## System boundary (important)
- This dashboard does **not** integrate with Shopify and does **not** manage checkout,
  payments, offers, discounts or Shopify orders.
- The AI bot is already integrated with Shopify + WhatsApp. This console **consumes**
  processed chats, summaries, intents, statuses and business activity events from the
  AI bot / backend and turns them into operations.
- A distinct **violet** accent marks everything the **AI** does; the **rose/berry**
  brand accent marks the **business/staff** — so the line between AI and human action
  is always visible. **AI cannot approve exchanges** — staff must.

## Screens (left sidebar)
1. **Dashboard** — 12 KPI cards + charts (chats over time, AI vs staff, intent donut,
   issues by type, top intents, high-priority queue, escalations, exchange trend,
   follow-ups due, staff workload). Global date filters.
2. **AI Chat Monitor** — 3-column shared inbox (list · full chat · AI/context panel).
3. **Order Conversations** — kanban + table (purchase-intent chats, *not* Shopify orders).
4. **Customer Issues** — support table + detail with SLA badges.
5. **Exchange Requests** — size/fit/colour swaps, staff-approval workflow.
6. **Future Follow-ups** — overdue / due-today / upcoming, mark complete.
7. **Custom Items** — simple admin list the AI bot can reference (+ add/edit).
8. **Staff Tasks** — board + workload, created from AI events.
9. **AI Bot Status** — health cards, AI metrics, color-coded event log.
10. **Analytics Reports** — 8 report tabs with cards, charts, tables, export.
11. **Settings** — business, AI bot API, staff, roles, webhooks, notifications, SLA rules.

**Global date filters:** 1D · 3D · 7D · 14D · 30D · This month · Last month · Custom range
(drive the Dashboard + Reports; default **Last 7 days** shows the headline figures).

## Run it
No build step — it is plain HTML/CSS/vanilla JS.

```bash
# from this folder
python3 -m http.server 8123
# then open http://localhost:8123/index.html
```
Or just open `index.html` directly in a browser.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | App shell (sidebar + top header) |
| `styles.css` | Design system (light/dark, components) |
| `data.js` | All sample data (`window.DB`) |
| `ui.js` | Shared helpers — charts, badges, icons (`window.UI`) |
| `views.js` | Screens 1–5 (`window.VIEWS` / `BIND` / `OPEN`) |
| `views2.js` | Screens 6–11 |
| `app.js` | Core engine: state, render, nav, header, modals, toasts, realtime (`window.App`) |

A simulated realtime feed injects a new AI conversation every ~15s (toast + event log +
"last event received" counter) so the prototype feels live. Theme toggle (light/dark) is
in the top header.
