# Slice Handoff — Slice 1: App shell + UI foundation

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (prototype-agent advised token mapping)
- **Status:** complete — typecheck + unit tests + Next build **green** under Node 20 (Playwright spec ready, not run)
- **Workflow:** `docs/workflows/phase-1-slice-workflow.md`

## What shipped

A running **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** application
**shell** for PEPPER ST., styled with the approved demo design tokens. It contains the
sidebar, topbar, and main content frame (in `base-dashboard-app/`), and the three approved nav surfaces
(**Dashboard / Chat Monitor / Analytics**). **No database, no Agno reads, no migrations,
no fabricated metrics** — pages show honest placeholders/empty states.

## Files changed (created)

> All app files live under `base-dashboard-app/`; project docs stay under `docs/`.

**Config**
- `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`,
  `tailwind.config.ts`, `components.json`, `next-env.d.ts`, `.gitignore`

**App**
- `app/layout.tsx` (root; fonts via Google Fonts `<link>`; metadata)
- `app/globals.css` (demo tokens → CSS variables; light + dark)
- `app/(dashboard)/layout.tsx` (shell composition)
- `app/(dashboard)/page.tsx` (Dashboard — placeholder cards + empty states)
- `app/(dashboard)/chat-monitor/page.tsx` (placeholder — built Slice 5)
- `app/(dashboard)/analytics/page.tsx` (placeholder — built Slice 6)

**Components**
- `components/shell/{app-shell,sidebar,topbar,theme-toggle,nav-items,page-header,empty-state}.tsx`
  (+ `nav-items.ts`)
- `components/ui/{button,card,badge}.tsx` (shadcn primitives **restyled** to demo tokens)

**Lib + tests**
- `lib/utils.ts` (`cn`), `lib/tokens.ts` (brand tokens)
- `lib/utils.test.ts`, `lib/tokens.test.ts`, `components/shell/nav-items.test.ts` (Vitest)
- `vitest.config.ts`, `playwright.config.ts`, `e2e/shell.spec.ts`

**Docs**
- This handoff; `docs/changelog/technical-decision-log.md` (TD-044/045);
  `docs/phases/phase-1.md`, `docs/phases/phase-1-implementation-plan.md` (Slice 1 status);
  `docs/architecture/05-tech-stack.md` (token-carry question resolved); `README.md`.

## Token mapping (demo → Tailwind)

- Demo CSS variables copied 1:1 into `app/globals.css` `:root` (and `[data-theme="dark"]`):
  brand rose `--accent #be185d`, AI violet `--ai #7c3aed`, WhatsApp `--wa #25d366`,
  radius `--r 14px` / `--rs 10px`, shadows, surfaces.
- `tailwind.config.ts` `theme.extend` references those variables (colors, radius,
  shadow, `fontFamily`), so **shadcn primitives are restyled to the demo**, not the
  default theme.
- Fonts: **Plus Jakarta Sans** + **JetBrains Mono** via Google Fonts `<link>` (matches
  the demo; avoids a build-time font fetch).

## Tests run

Verified under **Node 20.20.2 / npm 10.8.2** (from `base-dashboard-app/`; the repo's
default Node 10 is too old for the locked stack — see Risks):

- `npm install` — ✅ 153 packages, clean.
- `npm run typecheck` (`tsc --noEmit`) — ✅ no errors.
- `npm run test` (Vitest) — ✅ **9/9 passed** across 3 files (brand tokens, `cn`, nav:
  exactly the three approved surfaces + no Bloomwire/parked labels).
- `npm run build` (Next 15.5) — ✅ compiled successfully; lint + type validity pass;
  **6 static routes** generated (`/`, `/chat-monitor`, `/analytics`, `/_not-found`).
- `npm run e2e` (Playwright) — **not run** (browser download required); spec is ready:
  `npm run e2e:install && npm run e2e`.

## Boundaries upheld

- **No DB / no Drizzle / no migrations / no seed** — zero data-layer code; no
  `DATABASE_URL` used; `.env*` gitignored.
- **`ai.agno_*` untouched** — no DB connection of any kind in this slice.
- **No `app_conversation_messages`, no transcript duplication** — no transcript code.
- **No fabricated metrics** — Dashboard shows `—` + "Awaiting data" and a banner
  stating data connects later; Chat Monitor/Analytics are empty states.
- **PEPPER ST.-branded, no Bloomwire** — logo "PS", "PEPPER ST.", tenant workspace
  chip (no invented person); E2E asserts no "Bloomwire"/parked surfaces.
- **Nav limited to the three approved surfaces** (unit + E2E enforced).

## Risks / follow-ups

- **Node version:** the repo's default Node is **v10.24.1**, too old for the locked
  stack (Next 15 needs Node ≥ 18.18). Use **Node 20 LTS** (`nvm use 20`; `.nvmrc` + the
  `engines` field pin this). Verified green on Node 20.20.2.
- **npm advisories:** a fresh install reports a few transitive vulnerabilities; do
  **not** run `npm audit fix --force` (it would break the locked stack). Revisit in
  Slice 7 hardening.
- **Next 15 / React 19** pinned by caret ranges; the lockfile now resolves exact versions.
- **Mobile drawer** is minimal (overlay + close); refine in Slice 7 demo hardening.
- **Deploy target** still open (tech-stack Q3).

## Gate status

- **Gate 3** (stack): ✅ locked. **Gate 0**: ✅ passed.
- **Gate 4** (per-slice QA + docs/handoff): typecheck + unit tests + Next build
  **green** under Node 20; Playwright spec ready (not yet run); docs/handoff updated.

## Next allowed step

**Slice 2 — Drizzle schema / migration proposal** (authors the schema to match
`docs/architecture/02-schema-proposal.sql.md`; **proposed, not applied**; needs
**Gate 2** before any apply in Slice 3). Do not start Slice 2 until directed.
