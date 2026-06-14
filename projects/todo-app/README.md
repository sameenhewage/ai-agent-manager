# Todo App

A tiny vanilla HTML/CSS/JS todo list. No build, no dependencies, no backend.
Todos are saved in the browser via `localStorage`.

## Run

Open `index.html` in any modern browser:

- Double-click `index.html`, **or**
- Serve the folder with any static server, e.g. `python3 -m http.server` and
  visit the printed URL.

## Features (first slice)

- Add a todo (empty / whitespace-only titles are ignored).
- View todos, with an empty state.
- Toggle complete / incomplete (checkbox + strikethrough).
- Delete a todo.
- Persists across reloads (localStorage key: `todos`).

## Not included yet

Editing a title, filters / sorting, due dates, accounts, sync, or a backend.
See `docs/product/` for the vision, scope, and PRD.
