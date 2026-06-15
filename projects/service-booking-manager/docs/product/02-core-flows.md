# Core User Flows

Version 1 centers on five flows, all performed by the admin in one browser.

## 1. Manage customers

1. Admin opens the Customers area.
2. Admin enters a customer name (and optional phone/email) and saves.
3. The customer appears in the customers list.
4. Empty or whitespace-only names are rejected.

## 2. Manage services

1. Admin opens the Services area.
2. Admin enters a service name (and optional duration/price) and saves.
3. The service appears in the services list.
4. Empty or whitespace-only names are rejected.

## 3. Create a booking

1. Admin opens the Bookings area and starts a new booking.
2. Admin picks an existing customer and an existing service.
3. Admin sets a date and time.
4. Admin saves; the booking is created with status `pending` and appears in the
   bookings list showing customer, service, date/time, and status.
5. A booking cannot be created without a customer, a service, and a date/time.

## 4. Change booking status

1. Admin selects a booking.
2. Admin changes its status to one of: pending, confirmed, completed, cancelled.
3. The change is reflected in the list and persists immediately.

## 5. View dashboard summary

1. On load (and after changes), the dashboard shows counts derived from
   bookings: total, pending, confirmed, completed.
2. Counts update as bookings are created or their status changes.

## Persistence (applies to all flows)

Customers, services, and bookings are read from `localStorage` on load and
written back on every change, so data survives reloads and restarts.

## Deferred (not in version 1)

- Editing or deleting customers, services, or bookings.
- Search, filtering, and sorting (beyond anything trivial and optional).
