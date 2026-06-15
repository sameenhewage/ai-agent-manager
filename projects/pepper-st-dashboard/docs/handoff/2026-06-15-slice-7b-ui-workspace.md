## Slice Handoff — Slice 7B: UI Workspace / Layout Correction

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`, Handoff: `handoff-agent`)
- **Type:** **UI layout / workspace correction — NOT new feature work.** No data model, no
  migrations, no DB writes, no new modules, no Phase 2.
- **Status:** complete — the app now behaves like a full-page SaaS workspace.
- **Related:** Slice 7 handoff (`2026-06-15-slice-7-demo-hardening.md`), ADR-0004/0005/0006/0007.

## Root UI problem found

The app never established a **viewport frame**. `components/shell/app-shell.tsx` used
`min-h-screen` with `sticky` chrome, so the **whole document scrolled**: a long transcript grew
the page and the user scrolled the entire document (sidebar/topbar included feel) instead of just
the transcript. Chat Monitor tried to fake a workspace with a brittle magic number
(`lg:h-[calc(100vh-210px)]` + `max-h-[75vh]`) — height/scroll responsibility was smeared across the
shell, the page, and the cards (a shallow seam).

**Deepening (improve-codebase-architecture lens):** make `AppShell` the single deep module that
owns the viewport frame — fixed `h-dvh`, `overflow-hidden`, non-scrolling chrome, and exactly **one**
scroll region (`<main>`). Pages then declare intent: **flowing** pages (Dashboard, Analytics) scroll
inside `main`; a **workspace** page (Chat Monitor) fills `h-full` and scrolls its own inner panes.
No magic numbers anywhere.

## Chat Monitor layout fix

- Page is now `flex h-full min-h-0 flex-col`; the redundant read-only banner was folded into the
  header (the topbar pill + per-transcript badge already state read-only) to maximise transcript room.
- `<ChatMonitor/>` root: `grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[340px_1fr]`
  (removed `calc(100vh-210px)` / `max-h-[75vh]` / `min-h-[60vh]`).
- Both cards: `flex min-h-0 flex-col overflow-hidden`; each scroll region: `min-h-0 flex-1 overflow-y-auto`.
- `grid-rows-[minmax(0,1fr)]` + `min-h-0` is the key: it lets the panes shrink so their own
  `overflow-y-auto` engages instead of growing the page.
- Skeleton (`loading.tsx`) updated to the same full-height workspace; mobile still shows one pane at
  a time (list first, back button to return). **Lazy list + lazy single-transcript fetch unchanged.**

## Dashboard cleanup

Replaced the sparse "header + 2 small cards + big void" with a compact, **honest** overview that
fills the frame: two entry cards (Chat Monitor, Analytics) with "Open →", a 3-card "How this console
works" row (live conversations / real metrics only / read-only & safe), and a "Tracked vs
not-tracked" strip. Vertically centered (`min-h-full … justify-center`) so tall screens stay
balanced (no giant bottom void) while short screens still grow + scroll in `main`. **No KPIs, no
fabricated numbers, no unsupported signals.**

## Analytics cleanup

Kept all real metrics and logic; improved the **report** feel: the range switcher sits in a toolbar
bar, an `OVERVIEW · <range>` section label groups the KPIs, and the daily chart gained a baseline +
real **Peak N/day** and **N conversations total** captions (both derived from the existing series —
no new/fake data). Scrolls inside `main` when content exceeds the viewport.

## Scroll behavior proof (Chrome DevTools, in-browser DOM assertions)

- **Document / page scroll:** `document.scrollingElement.scrollHeight - innerHeight === 0` on all
  three pages; `html` not scrollable; shell frame computed `overflow: hidden`; `main` computed
  `overflow-y: auto` (the single scroll owner). The document never scrolls.
- **Chat Monitor — conversation list pane:** `min-h-0 flex-1 overflow-y-auto` → clientH 683,
  scrollH 855, **canScrollBy 172px** (scrolls inside its pane).
- **Chat Monitor — transcript pane:** `…overflow-y-auto bg-panel2` → clientH 693, scrollH 1161,
  **canScrollBy 468px**. Setting `pane.scrollTop = 400` moved the pane (0→400) while
  `document.scrollTop` stayed **0** (`docMoved: false`).
- **Dashboard:** `docOverflowBy 0`, `mainOverflowBy 0`; content vertically centered (was ~353px
  bottom void before centering).
- **Analytics:** `docOverflowBy 0`; fits at tall viewport, and scrolls within `main` (the proven
  scroll owner) when content exceeds height.

## Performance regression check

Same hybrid architecture (static shell + lazy list/transcript API routes) — **not** changed.
- Build: `/chat-monitor` still `○ Static`; `/api/chat-monitor/conversations` and
  `.../[id]/transcript` still `ƒ Dynamic`.
- Dev (warm): shell `GET /chat-monitor` **199ms**; list API **841ms**; single transcript **679ms**.
- **All transcripts are NOT parsed before first render** — dev logs show exactly **one** transcript
  fetch (the auto-selected first conversation), not 13. `db:chat:verify`: list timing 961ms (no
  transcript parsing), slowest single transcript 799ms (parses ONE session).

## PII / read-only / fake-data boundary confirmation

- **Masked everywhere** — list + transcript show `94•••••297`-style ids; API **paths** use the
  conversation UUID, never a phone. `db:chat:verify`: no raw `external_contact_id` / session id in
  the list **or** any transcript payload → PASS.
- **Read-only** — only `SELECT`s; `ai.agno_*` untouched; nothing persisted; no migrations/tables/DB
  writes added.
- **No fake data** — no KPIs/statuses invented; Dashboard shows capabilities (not metrics);
  Analytics numbers all derive from existing real series; no console errors on any page.
- **IDOR-safe** — unknown + malformed ids return null (unchanged, re-verified).

## Tests / typecheck / build (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **99/99** (13 files; data contracts unchanged)
- `npm run build` — ✅ static shell + dynamic API routes preserved
- `npm run db:chat:verify` — ✅ ALL CHECKS PASSED (split contract, masking, no leaks, IDOR)
- **Testing note:** per the brief, no brittle CSS-pixel tests were added; layout was verified with
  **runtime DOM scroll assertions** in Chrome DevTools (above), which test behavior, not classnames.

## Files changed

- `components/shell/app-shell.tsx` — viewport frame (flex `h-dvh` + `overflow-hidden`; `main` is the
  only scroll region; sidebar/topbar stable).
- `app/(dashboard)/chat-monitor/page.tsx` — full-height workspace shell (banner folded into header).
- `components/chat-monitor/chat-monitor.tsx` — workspace grid + per-pane `min-h-0 overflow-y-auto`.
- `app/(dashboard)/chat-monitor/loading.tsx` — matching workspace skeleton.
- `app/(dashboard)/page.tsx` — compact, centered, honest overview (entry + capability cards).
- `components/analytics/analytics.tsx` — report toolbar, Overview label, chart baseline/captions.
- Docs: this handoff, `docs/changelog/technical-decision-log.md` (TD-059/060), `docs/phases/phase-1.md`.

## Skills followed

- **`improve-codebase-architecture`** (`.claude/skills/improve-codebase-architecture/SKILL.md`) —
  applied the deepening lens (deletion test): the smeared height/scroll logic was shallow; the fix
  concentrates it in one deep seam (`AppShell` owns the frame; pages declare flow vs workspace).
- **`tdd`** — kept the test surface green; chose behavioral runtime scroll assertions over brittle
  pixel tests (per the brief).
- **`review`** — two-axis below.
- **`handoff`** — this doc (repo convention `docs/handoff/`).

## Review (two-axis)

- **Standards: PASS** — DB stays server-side (API routes import `pg` via the service; client bundle
  has no `pg`); read-only `ai.*`; no new deps; Tailwind utilities only; matches conventions; the
  shell is now a single deep seam (less smear).
- **Spec: PASS** — full-height workspace with internal pane scroll; no document scroll; Dashboard a
  clean app overview (no fake KPIs); Analytics a real-data report; hybrid lazy split preserved;
  mobile usable.

## Risks / follow-ups

- `h-dvh` is well-supported (Tailwind 3.4.17 / modern browsers); the shell also has
  `overflow-hidden`, so the document can't scroll even on the rare engine where `dvh` is quirky.
- Programmatic viewport resize was blocked (window maximized) during the headless check; analytics
  small-screen scroll was proven via computed styles (`main` is the scroll owner) rather than a live
  resize.
- Dashboard centering is deliberate for a sparse, metric-free hub; if real headline KPIs are ever
  added (future, needs a cheap aggregate — see Slice 7 follow-up), switch it to top-aligned.
- Dev server currently on **:3002** (ports 3000/3001 were held by other processes) — stop when done.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 7B. Phase 1 remains
  **feature-complete**; this slice was UI quality only.

## Next recommended step

Phase 1 is feature-complete and now demo-polished. New session: full **Phase-1 acceptance review**
(+ optional deploy-target decision), or **Phase 2** discovery (live AI→human handover, ADR-0009).
**Do not start Phase 2 without explicit direction.**
