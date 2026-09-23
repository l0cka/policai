# A2J Editorial index 02

The dashboard adopts the approved Policai paper/forest identity without sharing
its runtime or data model. Arial handles interface/body text; Georgia handles
editorial headings; monospace is reserved for metadata. The companion mark is
an inline, decorative SVG with the A2J edition label and an accessible home link.

`app/editorial.css` is a scoped presentation layer over existing dashboard CSS.
The base theme tokens and font roles live in `app/globals.css`. The signal network
is still source-linked and uses the same data, now behind a native keyboard
operable disclosure. Mobile results precede secondary collection/deadline context.
Navigation, deadline queries, stream/search/opportunity/screened-out filters,
source provenance, dates, sector research and theme storage are unchanged. Escape
now returns focus from the mobile menu to its trigger.

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
