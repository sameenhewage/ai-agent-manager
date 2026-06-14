# Feature Scope

## First vertical slice

> **User can create, view, complete/incomplete, and delete todos**, with todos
> persisted in `localStorage`.

### In scope

- Add a todo (non-empty title).
- View the list of todos (with an empty state).
- Toggle a todo complete/incomplete.
- Delete a todo.
- Persist all changes to `localStorage` (survive reload).
- A minimal, clean, single-page UI.

### Out of scope (this slice)

- Editing a todo title (deferred to a later slice).
- Filtering / sorting / search.
- Due dates, priorities, tags, reminders, notes.
- Auth, accounts, multi-user, sync.
- Backend, server, database.
- Any npm packages, build step, or framework.

### Deferred / future (not promised)

- Edit title in place.
- Filter: All / Active / Completed.
- "Clear completed" bulk action.

## Constraints (from the requester)

- Vanilla HTML/CSS/JS only; separate `index.html`, `styles.css`, `app.js`.
- `localStorage` for persistence; no backend / DB / auth.
- No unrelated packages; keep it simple, do not over-engineer.
- Lives under `projects/todo-app/`.
