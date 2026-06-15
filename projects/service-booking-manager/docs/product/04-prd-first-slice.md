# PRD - Service Booking Manager, First Vertical Slice

> Small PRD for the first slice. Normally this would be published to the issue
> tracker (GitHub Issues) with the `ready-for-agent` label per
> `docs/agents/issue-tracker.md`. The repo has no `gh`/remote configured yet, so
> it lives here as a doc - move it to a GitHub issue once `gh` is set up.

## Problem Statement

A small local business needs a no-friction way to keep track of its customers,
the services it offers, and the bookings that connect them - without accounts,
servers, or installs.

## Solution

A single-page, browser-only Service Booking Manager. The admin adds customers
and services, creates bookings that reference one customer and one service at a
chosen date/time, moves each booking through its status, and sees a simple
dashboard summary. Everything is saved in the browser.

## User Stories

1. As an admin, I want to add a customer with a name (optional phone/email), so that I can reference them on bookings.
2. As an admin, I want to see all customers, so that I know who I can book.
3. As an admin, I want empty/whitespace-only customer names rejected, so that I do not create blank customers.
4. As an admin, I want to add a service with a name (optional duration/price), so that I can book it.
5. As an admin, I want to see all services, so that I know what I can book.
6. As an admin, I want empty/whitespace-only service names rejected, so that I do not create blank services.
7. As an admin, I want to create a booking by choosing a customer, a service, and a date/time, so that I can schedule work.
8. As an admin, I want a booking to require a customer, a service, and a date/time, so that I cannot create incomplete bookings.
9. As an admin, I want new bookings to start as `pending`, so that there is a clear default state.
10. As an admin, I want to change a booking's status (pending/confirmed/completed/cancelled), so that I can track its progress.
11. As an admin, I want to see all bookings with customer, service, date/time, and status, so that I have an overview.
12. As an admin, I want a dashboard with total, pending, confirmed, and completed counts, so that I get an at-a-glance summary.
13. As an admin, I want everything to persist across reloads and restarts, so that I do not lose data.

## Implementation Decisions

- **Platform:** static single-page app; open `index.html` directly in a browser (no server). See ADR-0001.
- **Files:** separate `index.html`, `styles.css`, `app.js` (no framework, no build).
- **Persistence:** `localStorage`; see Data Model for keys.
- **No deletion/editing in v1** to keep the slice thin and avoid referential-integrity work (bookings only ever reference customers/services that still exist).

## Data Model

Three record types, persisted as JSON in `localStorage`.

- **Customer**: `{ id, name, phone?, email?, createdAt }`
- **Service**: `{ id, name, durationMinutes?, price?, createdAt }`
- **Booking**: `{ id, customerId, serviceId, dateTime, status, createdAt }`
  - `status` is one of `pending | confirmed | completed | cancelled` (default `pending`).
  - `dateTime` is stored as an ISO 8601 string.
  - `customerId` / `serviceId` reference existing records by `id`.

`id` is generated client-side (e.g. `crypto.randomUUID()`).

Proposed `localStorage` keys (namespaced):
- `sbm.customers` -> Customer[]
- `sbm.services` -> Service[]
- `sbm.bookings` -> Booking[]

The dashboard summary is **derived** from `sbm.bookings` (not stored
separately).

## Acceptance Criteria / Test Checklist

- [ ] Adding a customer with a non-empty name shows it in the customers list and persists it.
- [ ] Empty/whitespace-only customer name is rejected (no record created).
- [ ] Adding a service with a non-empty name shows it in the services list and persists it.
- [ ] Empty/whitespace-only service name is rejected (no record created).
- [ ] A booking can be created only when a customer, a service, and a date/time are all provided.
- [ ] A new booking has status `pending`.
- [ ] A booking's status can be changed to confirmed, completed, or cancelled (and back), and the change persists.
- [ ] The bookings list shows customer name, service name, date/time, and current status.
- [ ] The dashboard shows correct total, pending, confirmed, and completed counts, updating as bookings change.
- [ ] All data (customers, services, bookings) survives a page reload and browser restart.

## Out of Scope

Editing/deleting records, auth/accounts/multi-user, backend/DB, payments,
notifications, calendar integration, staff scheduling, advanced reports, and
non-trivial search/filtering. No packages, build step, or framework.

## Further Notes

- The technical baseline (vanilla HTML/CSS/JS + `localStorage`) is recorded in
  ADR-0001 (`projects/service-booking-manager/docs/adr/0001-technical-baseline.md`).
- Likely next slices: edit/delete records; filter bookings by status; basic
  inline validation messaging.
