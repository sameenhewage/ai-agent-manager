# Feature Scope

## First vertical slice

> **Admin can create customers, create services, create bookings (assigning a
> customer + service + date/time), update a booking's status, and see a simple
> dashboard summary** — all persisted in `localStorage`.

### In scope

- Create a customer (non-empty name; optional phone/email).
- View the list of customers.
- Create a service (non-empty name; optional duration/price).
- View the list of services.
- Create a booking: choose an existing customer + existing service, set
  date/time; new bookings start as `pending`.
- View the list of bookings (customer, service, date/time, status).
- Change a booking's status: pending / confirmed / completed / cancelled.
- Dashboard summary: total, pending, confirmed, completed counts.
- Persist customers, services, and bookings to `localStorage`.
- A minimal, clean, single-page UI.

### Out of scope (this slice / v1)

- Editing or deleting customers, services, or bookings.
- Authentication, accounts, multi-user.
- Backend, server, database.
- Payments, notifications, calendar integration.
- Staff scheduling, advanced reports/analytics.
- Search / filtering / sorting — unless trivial and optional.
- Any npm packages, build step, or framework (no React/Vite/Tailwind).

### Deferred / future (not promised)

- Edit/delete records.
- Filter bookings by status or date.
- Customer/service detail views.

## Constraints (from the requester)

- Vanilla HTML/CSS/JS only; separate `index.html`, `styles.css`, `app.js`.
- `localStorage` for persistence; no backend / DB / auth.
- No dependencies; keep code simple and readable; do not over-engineer.
- Lives under `projects/service-booking-manager/`.
