# Research interface architecture

Policai and Policai A2J share a visual identity, not a runtime or data store.
The register remains Git-backed and uses the existing public-data verification
gates. A2J remains a separate PostgreSQL application. Neither interface writes
canonical records, approves detections, runs a collector or changes schema.

## Policai register

- `src/lib/policy-register.ts` owns validated URL state, filter transitions and
  non-mutating selection/sorting. Sort labels match the displayed jurisdiction,
  policy type and status names. IDs break ties for deterministic ordering.
- `src/hooks/use-register-state.ts` adapts browser history to React. It preserves
  Next.js history metadata, handles Back/Forward and replaces research state
  instead of adding an entry for every keystroke. Server rendering uses a stable
  default snapshot; the client restores the query during hydration.
- `src/components/policy-browser.tsx` composes controls and supplies the selected
  rows, sort and page. Changing search, a filter or sort resets the page; changing
  the responsive view does not.
- `src/components/policy-table.tsx` renders the controlled result view. It no
  longer owns a second sort/page state or requires remounting to reset results.
- `src/components/policy-indicators.tsx` owns shared source, status and
  jurisdiction indicators. Courts, detail, timeline and network views do not
  import the entire register table to obtain a status pill.

URL fields are `q`, `jurisdiction`, `type`, `status`, `sort`, `view` and `page`.
Filter lists are comma-separated. Default values are omitted. The free-text
query `all` is literal text, not a filter sentinel. Existing unrelated URL fields
and Next.js history state are preserved.

## A2J radar

- `apps/probono/dashboard/lib/radar-state.ts` validates incoming search parameters,
  owns stream labels, builds result-anchored URLs and calculates page ranges.
- `lib/radar-data.ts` owns typed read queries. Count and rows use one parameterized
  predicate. A result page contains at most 25 rows, ordered by publication or
  collection date and then ID. Source names and indexed item text are searchable.
- `app/radar-controls.tsx` renders GET search, filters, active context and pagination.
  It requires no client-side JavaScript. Filter changes reset to page one;
  pagination keeps filters and points to `#radar-feed`.
- `app/page.tsx` coordinates reads and rendering. Filtered and paginated research
  views do not fetch or display the landing-page network and recent highlights.
- `app/signal-network.tsx` consumes repository DTOs and the shared stream labels.
  Population aggregates remain separate from the limited visual sample.

Pagination is a live archive, not a transactional snapshot across visits. A new
collection between page requests can shift offsets. Count and row queries are
also separate reads. If strict snapshot browsing becomes a requirement, add a
snapshot/cursor contract with database tests; do not imply it exists today.
The current offset approach is suitable for this small, daily-collected archive.

## Design decisions

Retain the existing paper/forest identity, native controls and light/dark themes.
Use the IBM/Carbon reference from `popular-web-designs` for functional hierarchy:
flat surfaces, explicit labels, 44–48px actions, visible result ranges and clear
recovery. Do not import IBM branding, a new font service or another UI framework.
Policai list summaries use 14px text rather than 12px.

## Verification

From the repository root:

```sh
npm ci
npm run check
npm --prefix apps/probono/dashboard ci
npm --prefix apps/probono/dashboard test
npm --prefix apps/probono/dashboard run typecheck
npm --prefix apps/probono/dashboard run build
```

The dashboard's state tests use Node's TypeScript stripping. The repository's
supported Node versions apply; verified on Node 24. A module-type detection
warning can occur because the existing dashboard package does not declare ESM.
Do not change its runtime module format just to suppress this test warning.

### Production-build browser checks

Use the in-memory fixture procedure in `apps/probono/dashboard/EDITORIAL.md`.
Never copy production environment files. Start its fixture with
`FIXTURE_ARCHIVE_COUNT=105` for the research suite (109 relevant synthetic rows),
then the built A2J standalone preview on `127.0.0.1:8896`. Start Policai's built
preview with `npm run start -- --hostname 127.0.0.1 --port 8898`.

From the root:

```sh
EVIDENCE_DIR="$TMPDIR/research-ui-evidence" node scripts/verify-research-ui.mjs
```

The suite checks literal queries, reload, repeated keyboard sorting, pagination,
source search, empty recovery, mobile overflow and detail-to-Back reading
position. It visits every archive page and verifies record uniqueness and count.
It retains axe incomplete results as well as violations.

Restart only the disposable fixture with no archive-count setting before running
the existing `test/editorial-browser.mjs` suite in the dashboard. That suite
expects the original four relevant records and covers all dashboard routes,
themes, mobile navigation, the sector map/system and signal-network disclosure.
A quoted exact title is used for its one-result search now that source names also
match. Stop both previews and the fixture after verification.

## Scope retained

Collector/retention work belongs to its separate coordinator. Canonical data,
publication rules, database schema, worker packages, production services, timers,
credentials and the unfinished `this-week` work in the other checkout are not
part of this change. A passing source check does not authorize publication or
deployment. Existing data-validation warnings and editorial content issues are
not repaired by a UI refactor.
