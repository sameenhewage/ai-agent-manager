# Domain Docs

How the engineering skills should consume domain documentation when exploring
the codebase.

This repository is an **AI agent manager / master-factory** repo that produces
multiple separate projects under `projects/`. It uses a **multi-project** layout:
every project owns its product docs, ADRs, and context. Root `docs/agents/` is
shared AI team documentation only — it is **not** a project context.

## Before exploring, read these

First identify the **active project** — the folder under `projects/` you are
working in (e.g. `projects/todo-app/`). Then read, scoped to that project:

- **`projects/<project-name>/CONTEXT.md`** — the project's domain glossary.
- **`projects/<project-name>/docs/adr/`** — ADRs that touch the area you're about
  to work in, for that project.
- **`projects/<project-name>/docs/product/`** — product vision, scope, and PRDs
  for that project.

Do **not** look for `CONTEXT.md` or `docs/adr/` at the repo root — they never
live there. Root `docs/agents/` is shared team documentation, not project
context.

A new project is created with its required skeleton up front (see **Project
bootstrap**, below). Beyond that skeleton, if a specific ADR or glossary term
doesn't exist yet, **proceed silently** — don't flag its absence. The producer
skill (`/grill-with-docs`) adds more, inside the active project, when terms or
decisions actually get resolved.

## File structure

Master-factory layout: shared AI team docs at the root, and one self-contained
folder per project under `projects/`.

```
/
├── AGENTS.md                     ← shared AI team rules
├── CLAUDE.md                     ← shared Claude guidance
├── .claude/                      ← shared agents, skills, workflows, templates
├── docs/
│   └── agents/                   ← shared AI team / workflow docs ONLY
└── projects/
    ├── todo-app/
    │   ├── CONTEXT.md            ← this project's domain glossary (required at bootstrap)
    │   ├── docs/
    │   │   ├── product/          ← this project's vision, scope, PRDs
    │   │   └── adr/              ← this project's architecture decisions
    │   └── ...                   ← this project's app code
    └── another-app/
        ├── CONTEXT.md
        ├── docs/
        │   ├── product/
        │   └── adr/
        └── ...
```

Notes:

- There is **no** root-level `docs/product/` and **no** root-level `docs/adr/`.
- Each project's docs are produced lazily (by `/grill-with-docs`, `/to-prd`,
  etc.) **inside that project**, only when decisions or terms get resolved.

## Project bootstrap (required skeleton)

Every project under `projects/<project-name>/` starts from a required skeleton,
created **before any implementation begins** (see the "Project bootstrap rule"
in `AGENTS.md`):

- `CONTEXT.md`
- `README.md`
- `docs/product/00-product-vision.md`
- `docs/product/01-users-and-roles.md`
- `docs/product/02-core-flows.md`
- `docs/product/03-feature-scope.md`
- `docs/product/04-prd-first-slice.md`
- `docs/adr/0001-technical-baseline.md`

All paths are relative to `projects/<project-name>/`. None of these are ever
created at the repo root — there is no root-level `docs/product/` or `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, a test name), use the term as defined in the active project's
`CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a real
gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
