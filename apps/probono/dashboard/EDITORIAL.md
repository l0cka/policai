# A2J Editorial index 02

The dashboard adopts the approved Policai paper/forest identity without sharing
its runtime or data model. Arial handles interface/body text; Georgia handles
editorial headings; monospace is reserved for metadata. The companion mark is
an inline, decorative SVG with the A2J edition label and an accessible home link.

`app/globals.css` is the dashboard's only stylesheet. It imports the shared
tokens from `app/design-tokens.css` and declares each rule once: there is no
second layer that overrides it, so a selector's block in `globals.css` is what
the browser applies. The rules behind the editorial shell are:

- Results come before context. `.radar-register .rail` keeps `order: 0`, so the
  visual order and the keyboard order match.
- The signal network panel is dark green in both themes, so its text and SVG
  labels use fixed light colours and not the page foreground.
- Every control is at least 44px, as on Policai.
- Each view has one filled primary button. The feed's Search button is the
  outlined quiet style.
- The hero search shows the shared focus ring on `:focus-visible` only, so a
  mouse click stays quiet. Its `:focus` rule sets no outline.
- Dates outside the dateline use interface text ("20 Oct 2026"), as on Policai.

The signal network
is still source-linked and uses the same data, now behind a native keyboard
operable disclosure. Mobile results precede secondary collection/deadline context.
Navigation, deadline queries, stream/search/opportunity/screened-out filters,
source provenance, dates, sector research and theme storage are unchanged. Escape
now returns focus from the mobile menu to its trigger.

## Shell

The header, navigation, footer and 404 page follow Policai's shell. The two
apps share no code, so each value is repeated here; change both sites together.

- **Status link.** `headerStatus()` in `lib/health-data.ts` returns the words
  beside the header dot: "Sources reached" when every active source returned
  on its last run, "N of M sources not reached" when some failed, are overdue
  or have never run, "No active sources", and "Status unavailable" when the
  database cannot be read. When the last successful run is more than 36 hours
  old, "Last collected <date>" (Sydney date) replaces the others. The layout
  renders per request, so the server decides staleness. The dot is `--trust`
  when healthy and `--caution` otherwise, in `--type-floor` mono. The link's
  accessible name starts with the visible words. Below 640px a healthy label
  is hidden and any other label wraps within 7.5rem; below 360px only the dot
  shows.
- **Breakpoints.** The primary nav and the bar height change together at
  1024px. Below it the menu button opens a full-width sheet under the bar.
  The sheet stays mounted and carries `hidden` while closed, so the button's
  `aria-controls` always names an element.
- **Theme toggle.** Three copies, each a 44px radiogroup with its own name:
  "Colour theme" in the footer, "Colour theme, menu" in the mobile sheet and
  "Colour theme, header" in the header from 1280px, the first width where it
  fits beside the nav and the longest status label.
- **Links to Policai.** `policai.org` links open in the same tab, as Policai's
  link to A2J does; the header link carries the arrow. Only GitHub opens a
  new tab.
- **Footer.** `--rule-heavy` top rule, a one-to-two grid from 1024px, and 6rem
  of bottom padding so the fixed "Scroll to top" button
  (`app/back-to-top.tsx`, shown after 300px of scroll) never covers a link.
- **Titles.** "Page · Policai A2J", the separator Policai uses.
- **404.** One column, 42rem wide, with Policai's spacing.

## Controls

- **Search inputs.** The hero, feed and sector directory inputs share one rule
  for border, `--radius-control`, background and a `--touch-target` minimum
  height. Each input's own rule sets only its size and padding. Focus changes
  the border colour, and keyboard focus adds the shared outline. No input
  draws a `box-shadow` ring.
- **Selected state.** The selected sector tab, the pressed relationship chip
  and the checked theme option use `--selected-bg`, `--selected-fg` and
  `--selected-border`, the fill Policai uses. Status colours are for statuses.
  The provider category chips keep a tinted fill, because a solid fill would
  hide the Legal Aid dot.
- **Theme toggle keys.** Arrow keys move to the next or previous option and
  wrap. Home and End move to the first and last option. Selection follows
  focus.
- **Sector category colours.** The five `--cat-*` tokens in `globals.css` are
  the only source. The legend dots use them in CSS. `categoryMatch()` in
  `app/sector-map-view.tsx` resolves them through a probe element each time
  the map style loads, so the markers follow the theme. The probe sets
  `transition: none`: under `prefers-reduced-motion` every element has a
  0.01ms transition, and a reused probe would otherwise return the previous
  colour. Community Legal Centres use `--caution`, which meets AA on the
  light page.
- **Missing map images.** The OpenFreeMap styles name icons their sprite does
  not hold. `setMissingStyleImageResolver` gives each a transparent 1px image,
  so MapLibre logs no warning. A `styleimagemissing` listener cannot do this:
  MapLibre 6 warns right after it fires the event.

## Theme init

`app/theme-init.ts` is a plain module that holds the theme storage key and the
static init script. The root layout renders the script in `<head>`, so a stored
light or dark choice applies before first paint. `app/theme-toggle.tsx` reads
the key from it. A server module imports only components from a `'use client'`
module: any other value becomes a client reference, and one inside `<head>` can
fail hydration with React #418. `test/client-boundary.test.mjs` (in
`npm run test`) enforces this for `app/`, `lib/` and `middleware.ts`.

## Checks

The root and dashboard remain independent packages. From repository root:

```sh
npm ci
npm run check
cd apps/probono/dashboard
npm ci
npm run typecheck
npm run build
```

### Safe browser fixture

Do not copy production environment files or connect these fixtures to production.
The fixture script creates an **in-memory** PostgreSQL-compatible PGlite instance
using the existing schema and visibly synthetic records. It binds only
`127.0.0.1:8897`; the preview binds only `127.0.0.1:8896`. Check those ports are free
first. No Docker, system service, canonical data or application DB adapter changes
are required. Stop the fixture and preview after testing.

Install fixture-only packages in a scratch npm directory (not this repository):

```sh
mkdir -p "$TMPDIR/a2j-editorial-test"
npm install --prefix "$TMPDIR/a2j-editorial-test" --no-audit --no-fund \
  @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
```

From `apps/probono/dashboard`, run in separate terminals:

```sh
FIXTURE_DEPENDENCIES="$TMPDIR/a2j-editorial-test" node test/editorial-fixture.mjs
```

After `npm run build`, prepare only the generated standalone artifact:

```sh
cp -a public .next/standalone/
cp -a .next/static .next/standalone/.next/
DATABASE_URL=postgresql://postgres@127.0.0.1:8897/postgres \
  HOSTNAME=127.0.0.1 PORT=8896 node .next/standalone/server.js
```

With Chromium installed and the root development dependencies present:

```sh
mkdir -p "$TMPDIR/a2j-editorial-evidence"
EVIDENCE_DIR="$TMPDIR/a2j-editorial-evidence" node test/editorial-browser.mjs
```

`CHROMIUM_BIN` can override `/usr/bin/chromium`. `TEST_BASE_URL` can override the
preview URL but must use `127.0.0.1`. The suite expects the synthetic fixture, not
live records. It checks filters/search/source links, deadline and collection
states, the sector map/system switch, mobile menu focus, native disclosure,
light/dark/system theme and keyboard interaction. It saves screenshots and full
axe violations **and incomplete results**. PGlite proves rendering and ordinary
queries, not production PostgreSQL concurrency or correctness of live records.

### Deadline accuracy fixture

`FIXTURE_DEADLINES=1` adds synthetic deadline rows: one consultation reported by an
official page and a law-firm write-up, a non-primary secondary date, a
month-precision date and a legacy "Applications open" row. `FIXTURE_PORT`
overrides the fixture port (default `8897`). With the preview pointed at that
fixture, `node test/deadlines-browser.mjs` checks that the duplicates merge into one
card with "Also reported by 1", the secondary date sits under its card, the month
date and the opening appear only in the calendar, and the feed rail and
`/this-week` use the same list. The display rules live in `lib/deadline-model.ts`
and are unit-tested by `test/deadline-model.test.mjs`.

## Evidence and integration boundary

Executed evidence: `/home/l0cka/Reports/2026-09-22-a2j-editorial-index/`.
See `RESULT.md` there for actual results and residual checks; this document does
not imply a deployment or accessibility certification.

Base: `c53d782724372ad7c7647fc24574170fb56af7b2`, fetched `origin/main`.
Development worktree: `/home/l0cka/Work/Argus/src/policai-a2j-editorial-index`.
Branch: `feat/a2j-editorial-index-02`. No commit, push, deploy or restart authority.

The editorial release originally excluded the parked `/this-week` work. The
feature is now integrated in source, preserving the mobile focus-restoration
behaviour. Its content rules, test fixtures and verification commands are in
[`docs/this-week.md`](../../../docs/this-week.md). This does not imply publication
or deployment. The original dirty home checkout remains preserved. Production
runtimes are release clones under `/var/lib`, not that home checkout. A push to
a production-tracked branch may trigger the guarded two-lane deployment timer;
source publication and deployment each require separate approval.
