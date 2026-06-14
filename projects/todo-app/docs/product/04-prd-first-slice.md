# PRD - Todo App, First Vertical Slice

> Small PRD for the first slice. Normally this would be published to the issue
> tracker (GitHub Issues) with the `ready-for-agent` label per
> `docs/agents/issue-tracker.md`. The repo has no `gh`/remote configured yet, so
> it lives here as a doc - move it to a GitHub issue once `gh` is set up.

## Problem Statement

I have small tasks to track and want a no-friction way to jot them down, check
them off, and clear them - without creating an account or installing anything.

## Solution

A single-page, browser-only todo list. I type a task and it is added; I check it
to mark it done; I delete the ones I no longer need. My list is still there when
I come back, because it is saved in the browser.

## User Stories

1. As a user, I want to add a todo by typing a title and pressing Enter or clicking Add, so that I can capture a task quickly.
2. As a user, I want empty or whitespace-only titles to be rejected, so that I do not create blank todos.
3. As a user, I want to see all my todos in a list, so that I know what I need to do.
4. As a user, I want a clear empty state when I have no todos, so that the app does not look broken.
5. As a user, I want to mark a todo as completed, so that I can track progress.
6. As a user, I want to un-mark a completed todo, so that I can correct mistakes.
7. As a user, I want completed todos shown distinctly (checked + strikethrough), so that done vs not-done is obvious.
8. As a user, I want to delete a todo, so that I can remove things I no longer need.
9. As a user, I want my todos to persist across page reloads and browser restarts, so that I do not lose my list.

## Implementation Decisions

- **Platform:** static single-page app; open `index.html` directly in a browser (no server).
- **Files:** `index.html` (structure), `styles.css` (presentation), `app.js` (behavior).
- **State model:** an in-memory array of todo objects, each `{ id, title, completed }`.
- **Persistence seam:** a thin storage layer in `app.js` (`loadTodos()` / `saveTodos()`) reading/writing a single `localStorage` key (`todos`). This is the seam tests target.
- **Rendering:** re-render the list from state after each change - simple and predictable, fine for this scale.
- **ID generation:** `crypto.randomUUID()` (fallback to timestamp) - internal detail, not user-facing.
- **No framework, no build, no dependencies.**

## Testing Decisions

- Test **external behavior**, not internals: given user actions, assert the visible list and the persisted `localStorage` value.
- No test runner exists (no packages), so the first slice uses a **manual test checklist** executed in the browser (see the scope message / below).
- A lightweight automated option (console assertions against the storage seam) can be added later if desired - flagged, not built.
- Key behaviors to verify: add, reject-empty, toggle complete/incomplete, delete, persistence across reload.

## Out of Scope

Editing titles, filtering/sorting, due dates/priorities/tags, auth, multi-user,
backend, database, and any packages or build step.

## Further Notes

- Edit-title is the most likely next slice.
- The technical baseline (vanilla HTML/CSS/JS + `localStorage`) is recorded in
  ADR-0001 (`projects/todo-app/docs/adr/0001-technical-baseline.md`).
