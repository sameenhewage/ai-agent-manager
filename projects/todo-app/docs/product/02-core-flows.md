# Core User Flows

The first slice covers four flows. Each is a single, obvious interaction.

## 1. Create a todo

1. User types a task title into the input.
2. User presses Enter or clicks "Add".
3. The todo appears in the list, marked active (not completed).
4. The input clears, ready for the next entry.

Empty or whitespace-only titles are ignored (no blank todos).

## 2. View todos

1. On load, the app reads saved todos from `localStorage`.
2. Todos render as a list, showing the title and completed state.
3. If there are none, a friendly empty state is shown.

## 3. Complete / un-complete a todo

1. User clicks the checkbox to toggle done.
2. Completed todos are visually distinct (checked + strikethrough).
3. The change persists immediately.

## 4. Delete a todo

1. User clicks the delete control on a todo.
2. The todo is removed from the list and from storage immediately.

## Deferred (not in first slice)

- Edit a todo's title in place. Kept for a later slice to keep this one thin.
