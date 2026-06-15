# ADR 0001: Technical Baseline for Service Booking Manager

## Status
Accepted

## Context
Service Booking Manager is the second workflow-test project inside the AI agent
manager repository. It is intentionally a small, browser-only app, but slightly
more advanced than the Todo app: it has three related record types (customers,
services, bookings) and a booking status lifecycle.

The goal is to validate the AI agent workflow on a slightly richer domain, not
to ship a production booking system. Product constraints:
- no authentication
- no multi-user accounts
- no backend
- no database
- data must survive page refresh
- runs directly in the browser
- no dependencies / no build step

The app and its documentation live under `projects/service-booking-manager/`.

## Decision
Use Vanilla HTML, CSS, and JavaScript (separate `index.html`, `styles.css`,
`app.js`) with `localStorage` persistence. No framework, no build tooling, no
backend, no authentication.

## Options Considered

### Option 1: Vanilla HTML/CSS/JS with localStorage (chosen)
Pros:
- zero dependencies, no build step
- simple to inspect, review, and reason about
- best fit for a workflow-validation project

Cons:
- more manual DOM/state code than a framework
- localStorage is single-browser only

### Option 2: React + Vite
Pros:
- component structure suits richer UIs
- closer to modern web development

Cons:
- adds dependencies and a build step
- too heavy for a workflow test; contradicts the "no React/Vite" constraint

### Option 3: Backend + database
Pros:
- real multi-device persistence and querying
- closer to a production SaaS architecture

Cons:
- unnecessary for this test; adds servers, schema, and ops
- slows down validating the agent workflow

## Reason

- **Why Vanilla HTML/CSS/JS:** the purpose is to test the AI workflow on a
  slightly richer domain, not to test a stack. Vanilla keeps the code small and
  reviewable and satisfies the explicit "no React/Vite/Tailwind/dependencies"
  constraint.
- **Why localStorage:** it satisfies "data survives refresh" with zero
  infrastructure. For a single local admin on one browser, it is sufficient.
- **Why no backend:** there is one local user and no need for shared data,
  remote access, or server-side logic; a backend would add cost and complexity
  with no benefit for this test.
- **Why no auth:** there is a single local admin and no multi-user or remote
  access, so authentication would protect nothing and only add friction.
- **Why this is still only a workflow test:** despite the relationships and
  status lifecycle, the scope is deliberately tiny and disposable. It exists to
  exercise discovery -> docs -> PRD -> slice -> review -> handoff, not to serve
  real customers.

## Consequences

### Positive
- fast to build, easy to test and review
- no dependency or build risk
- relationships (customer/service/booking) and a status lifecycle give the
  workflow something more realistic to exercise

### Trade-offs
- data is limited to one browser/device; no sync or backup
- no concurrent or multi-user use
- no server-side validation or integrity; the app must enforce its own rules
- editing/deleting records and richer querying are deferred; revisiting any of
  these (multi-device, multi-user, reporting) would require a new ADR

## Related Documents
- `projects/service-booking-manager/docs/product/00-product-vision.md`
- `projects/service-booking-manager/docs/product/03-feature-scope.md`
- `projects/service-booking-manager/docs/product/04-prd-first-slice.md`
