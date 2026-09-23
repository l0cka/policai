# This week

Both applications have a read-only `/this-week` route and a primary navigation
entry on desktop and mobile. They use existing publication rules and data stores;
no collection, editorial approval, email delivery or schema change is performed.

## Policai

`src/lib/this-week.ts` selects verified, non-dismissed developments in the seven
elapsed days ending at `lastHealthyAt ?? lastCollectedAt`. The page shows that
exact historical window and warns when it is more than seven days old. Without a
usable anchor it reports coverage unavailable, not a quiet week. Detection date
is not presented as the date of a substantive policy change.

The server route reads `getPolicies()` and `getDevelopments()` with their default
public access. That preserves withholding, stale-verification projection and
related-record filtering. Selection helpers are not replacements for these gates.

Coming up uses today's Sydney date, independently of collection freshness. It
includes verified proposed, active and amended policies with effective,
commenced or consultation-closed dates today or later. Current month/year-only
dates remain visible with their original precision and an exact-day warning.
Impossible dates and duplicate entries are excluded. Calendar dates use the
register's normalized YYYY-MM-DD storage with separate precision metadata.

The route is dynamic so deadlines advance even when collection stalls. No
canonical JSON is modified. The page does not generate legal significance claims
or summaries beyond the existing records.

## A2J

`lib/this-week-data.ts` coordinates read queries, while `app/this-week/page.tsx`
renders the brief. It reuses shared stream labels, radar opportunity selection,
safe source URLs and deadline helpers.

- Potential opportunities use the radar's existing open-opportunity predicate,
  without an age cutoff. The first page has at most 25 rows, with a total and a
  link to the paginated opportunities feed. A missing deadline is not proof that
  an opportunity is open; the page says availability must be checked.
- Approaching deadlines show up to five future/current action dates, soonest
  first, with a link to all deadlines.
- Recent sector signals use `lib/weekly-query.ts`: relevant items from the last
  168 hours, inclusive of both endpoints and excluding future dates. Publication
  date takes precedence over collection date. The query is parameterized and
  ordered by date then ID, with at most 12 rows and the full matching count.
  Using hours rather than calendar-day intervals preserves the displayed window
  through Sydney daylight-saving transitions.

The brief calls these machine-selected leads, not verified advice or inherently
significant legal developments. Empty sections remain visible. Coverage and
full-feed links support checking beyond the brief.

## Checks

```sh
npm run check
npm --prefix apps/probono/dashboard test
npm --prefix apps/probono/dashboard run typecheck
npm --prefix apps/probono/dashboard run build
```

Root tests cover selection, date boundaries/precision, stale collection and
missing anchors. The SQL integration test executes the actual weekly query on a
disposable in-memory database, including exclusions, total-vs-limit, tie order,
empty results and daylight saving:

```sh
cd apps/probono/dashboard
FIXTURE_DEPENDENCIES="$TMPDIR/a2j-editorial-test" \
  node --experimental-strip-types test/weekly-query.integration.mjs
```

Use the scratch PGlite dependency setup and production-preview instructions in
`apps/probono/dashboard/EDITORIAL.md`. Start the fixture with `FIXTURE_WEEKLY=1`
for `scripts/verify-this-week.mjs`, then run from the root with `EVIDENCE_DIR` set.
Start Policai on loopback port 8898 and A2J on 8896 against the in-memory socket at
8897. The browser suite verifies content, continuation links, navigation, themes
and four viewport widths; it retains axe incomplete results, not only violations.
`FIXTURE_EMPTY=1` provides an empty archive for manual/browser empty-state checks.
Restart the fixture without either flag before the existing editorial browser
suite, which expects four standard records. Never point fixture setup at live
PostgreSQL or copy production credentials. Stop previews after verification.
