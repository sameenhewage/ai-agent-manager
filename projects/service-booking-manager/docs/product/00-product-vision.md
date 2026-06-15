# Product Vision - Service Booking Manager (Workflow Test)

## Why this exists

This is a **workflow-test project** — slightly more advanced than the Todo app —
to exercise our AI agent workflow (discovery -> product docs -> PRD -> vertical
slice -> review -> handoff) on a small app that still has real relationships
(customers, services, bookings) and a status lifecycle. The product itself is
deliberately kept minimal.

## Vision

A single local business admin can, entirely in the browser, keep a simple book
of customers and services, create bookings that connect them at a date and time,
move each booking through its status, and see an at-a-glance summary — with no
accounts, no setup, and no backend.

## What success looks like

- The admin can add customers and services, then create bookings that reference
  them, in seconds.
- Each booking's status can move between pending, confirmed, completed, and
  cancelled.
- The dashboard always reflects the current counts (total, pending, confirmed,
  completed).
- All data is still there after closing and reopening the browser.
- The whole thing runs by opening one file - no server, no install.

## Non-goals

Accounts, multi-user, payments, notifications, calendars, staff scheduling, and
advanced reporting. If a feature is not needed to prove the workflow on a
slightly richer domain, it is out.
