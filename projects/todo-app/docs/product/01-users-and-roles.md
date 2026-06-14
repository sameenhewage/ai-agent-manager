# Users & Roles

## Primary (and only) user

A single, anonymous **local user** on their own device and browser.

| Role | Can do | Notes |
| ---- | ------ | ----- |
| Local user | Create, view, complete/incomplete, delete todos | No login, no identity |

## Explicitly no roles

- No admin, no sharing, no multi-user, no permissions.
- No authentication or accounts (per project constraints).

## Implications

- No user data beyond the todo list itself.
- Data is private to the browser via `localStorage`; clearing browser data
  clears the todos.
