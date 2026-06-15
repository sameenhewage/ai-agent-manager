# Users & Roles

## Primary (and only) user

A single **admin** for one small local business, working on their own device and
browser. They act as receptionist/owner: they manage customers, services, and
bookings.

| Role | Can do | Notes |
| ---- | ------ | ----- |
| Admin (local) | Create/view customers and services; create bookings; set booking status; view dashboard | No login, no identity |

## Explicitly no roles

- No customer-facing login or self-service booking.
- No staff accounts, permissions, or multi-user separation.
- No authentication or accounts (per project constraints).

## Implications

- No user data beyond the business's own customers, services, and bookings.
- Data is private to the browser via `localStorage`; clearing browser data
  clears everything.
- "Customer" is a record the admin manages, **not** a person who logs in.
