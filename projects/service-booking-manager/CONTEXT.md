# Service Booking Manager

A single-admin, browser-only tool for a small local business to manage
customers, services, and bookings. No accounts, backend, or database — all
state lives in the browser via localStorage. Built as a workflow-test project.

## Language

### People

**Admin**:
The single local business user who runs the app. The only user; manages all
customers, services, and bookings. No login or identity.
_Avoid_: User, staff, owner, account

**Customer**:
A person the business serves. Can be created and viewed; referenced by a
booking. A record the admin manages, not someone who logs in.
_Avoid_: Client, guest, contact, lead

### Catalog

**Service**:
Something the business offers and can be booked (e.g. "Haircut"). Can be created
and viewed; referenced by a booking.
_Avoid_: Product, item, treatment, offering

### Bookings

**Booking**:
An appointment that links one customer and one service at a specific date and
time, and carries a status.
_Avoid_: Appointment, reservation, order, job

**Booking status**:
The lifecycle state of a booking. Exactly one of: `pending`, `confirmed`,
`completed`, `cancelled`. New bookings start as `pending`.
_Avoid_: State (generic), stage, phase

**Dashboard summary**:
The at-a-glance counts derived from bookings: total, pending, confirmed, and
completed.
_Avoid_: Report, analytics, stats page

### Data

**Persistence**:
Saving customers, services, and bookings to the browser via localStorage, so
data survives reloads and browser restarts.
_Avoid_: Storage, cache, database, sync
