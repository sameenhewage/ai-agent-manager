"use strict";

(function () {
  var STORAGE_KEY = "todos";

  var form = document.getElementById("todo-form");
  var input = document.getElementById("todo-input");
  var list = document.getElementById("todo-list");
  var emptyState = document.getElementById("empty-state");

  var todos = loadTodos();

  // --- Storage seam ---------------------------------------------------------

  function loadTodos() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (t) {
          return t && typeof t.title === "string";
        })
        .map(function (t) {
          return {
            id: typeof t.id === "string" ? t.id : createId(),
            title: t.title,
            completed: Boolean(t.completed)
          };
        });
    } catch (e) {
      return [];
    }
  }

  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      // Storage unavailable/full: app still works in-memory for this session.
    }
  }

  // --- Actions --------------------------------------------------------------

  function addTodo(title) {
    var trimmed = title.trim();
    if (!trimmed) return false;
    todos.push({ id: createId(), title: trimmed, completed: false });
    saveTodos();
    render();
    return true;
  }

  function toggleTodo(id) {
    todos = todos.map(function (t) {
      if (t.id !== id) return t;
      return { id: t.id, title: t.title, completed: !t.completed };
    });
    saveTodos();
    render();
  }

  function deleteTodo(id) {
    todos = todos.filter(function (t) {
      return t.id !== id;
    });
    saveTodos();
    render();
  }

  // --- Rendering ------------------------------------------------------------

  function render() {
    list.innerHTML = "";

    if (todos.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    todos.forEach(function (todo) {
      var li = document.createElement("li");
      li.className = "todo-item" + (todo.completed ? " completed" : "");
      li.dataset.id = todo.id;

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "todo-checkbox";
      checkbox.checked = todo.completed;
      checkbox.setAttribute("aria-label", 'Mark "' + todo.title + '" as completed');

      var title = document.createElement("span");
      title.className = "todo-title";
      title.textContent = todo.title;

      var del = document.createElement("button");
      del.type = "button";
      del.className = "delete-btn";
      del.textContent = "Delete";
      del.setAttribute("aria-label", 'Delete "' + todo.title + '"');

      li.appendChild(checkbox);
      li.appendChild(title);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  // --- Helpers --------------------------------------------------------------

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  // --- Events ---------------------------------------------------------------

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (addTodo(input.value)) {
      input.value = "";
    }
    input.focus();
  });

  list.addEventListener("click", function (e) {
    if (!e.target.classList.contains("delete-btn")) return;
    var li = e.target.closest(".todo-item");
    if (li) deleteTodo(li.dataset.id);
  });

  list.addEventListener("change", function (e) {
    if (!e.target.classList.contains("todo-checkbox")) return;
    var li = e.target.closest(".todo-item");
    if (li) toggleTodo(li.dataset.id);
  });

  // --- Init -----------------------------------------------------------------

  render();
})();
