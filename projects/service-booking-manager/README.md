# Service Booking Manager

A small, browser-only Service Booking Manager for a single local business admin.
Manage customers, services, and bookings, move bookings through their status,
and see a simple dashboard summary. No build, no dependencies, no backend — data
is saved in the browser via `localStorage`.

## Status

**First vertical slice complete.** Customers, services, and bookings can be
created and viewed; each booking carries a status (pending / confirmed /
completed / cancelled) that can be changed and persists; and a dashboard
summarizes the totals. All data is saved in the browser via `localStorage`, and
the pure domain logic in `logic.js` is covered by zero-dependency Node tests.

## Run

Open `index.html` in any modern browser:

- Double-click `index.html`, **or**
- Serve the folder with any static server, e.g. `python3 -m http.server` and
  visit the printed URL.

## Features (version 1)

- Create and view customers.
- Create and view services.
- Create bookings, each assigned one customer and one service, with a date/time.
- Change a booking's status: pending, confirmed, completed, cancelled.
- Dashboard summary: total customers, services, and bookings, plus per-status
  booking counts (pending, confirmed, completed, cancelled).
- Persists across reloads (via `localStorage`).

## Test

The domain logic (`logic.js`) has zero-dependency unit tests that use Node's
built-in test runner. **Node 18+ is required** (`node --test` is unavailable on
older versions):

```bash
cd projects/service-booking-manager
node --test
```

## Not included

Authentication, multi-user accounts, backend, database, payments, notifications,
calendar integration, staff scheduling, advanced reports, and non-trivial
search/filtering.

## Docs

See `docs/product/` for the vision, users, flows, scope, and the first-slice
PRD, and `docs/adr/0001-technical-baseline.md` for the technical baseline
decision.
