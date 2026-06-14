# Todo App

A single-user, browser-only todo list, built as a workflow-test project. It has
no accounts, backend, or database — all state lives in the browser.

## Language

**Todo**:
A single task the local user wants to track. Has a title and a completed flag.
_Avoid_: Task, item, entry, note

**Title**:
The text of a todo. Required; empty or whitespace-only titles are rejected.
_Avoid_: Name, label, description

**Active**:
A todo that has not been completed yet.
_Avoid_: Open, pending, incomplete, unchecked

**Completed**:
A todo the local user has checked off. Shown checked, with strikethrough.
_Avoid_: Done, finished, closed

**Empty state**:
The friendly message shown when there are no todos, so the app doesn't look
broken.
_Avoid_: Placeholder, blank screen

**Local user**:
The single, anonymous person using the app on their own device and browser.
There is no login, identity, or multi-user concept.
_Avoid_: Account, member, customer

**Persistence**:
Saving the whole todo list to the browser under the `localStorage` key `todos`,
so it survives page reloads and browser restarts.
_Avoid_: Storage, cache, database, sync
