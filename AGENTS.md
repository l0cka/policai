# AGENTS.md - Policai Codebase Guide

## Repository boundaries

This repository contains two independent applications. The guide below describes
the root Policai application. Pro Bono Radar lives in `apps/probono`; read
`apps/probono/AGENTS.md` before working there. Its dashboard and worker retain
separate manifests and lockfiles. Do not install them as root npm workspaces.

Policai's canonical data remains Git-backed JSON. Pro Bono Radar uses PostgreSQL;
its database, credentials, and backups must never enter Git. Sharing a repository
does not merge their publication rules, processes, or deployment authority.

Run the root `npm run check` and the affected child checks before handing off a
cross-application change. Keep production runtimes independent. A push to `main`
deploys: Cloudflare Workers Builds redeploys each site the change touches, and the host
dispatcher on Argus rebuilds the Pro Bono worker image for code changes under
`apps/probono/` outside `dashboard/` (`docs/hosting-argus.md`, Lane routing,
lists the paths that only fast-forward).

## Shared design tokens

`design/tokens.css` is the single source for values both sites share: type
scale (`--type-*`, `--tracking-eyebrow`), font roles (`--font-sans`,
`--font-display`, `--font-mono`), spacing (`--space-*`), radii
(`--radius`, `--radius-control`, `--radius-pill`), focus ring
(`--focus-ring-*`), core, status and row-hover colours, rules, shadows and
motion. The
A2J Workers build sees only `apps/probono/dashboard`, so neither app imports
across that boundary. `node scripts/sync-design-tokens.mjs` writes
byte-identical copies to `src/app/design-tokens.css` and
`apps/probono/dashboard/app/design-tokens.css`; both apps import their copy
from `globals.css`. Never edit a copy. `src/lib/design-tokens-sync.test.ts`
(in `npm run test`, so `npm run check`) fails when a copy drifts. Keep
app-only values (Policai's `--jd-*` and chart colours, A2J's `--s-*` stream
colours) in each app's `globals.css`, and don't redeclare a shared token
there.

## Project Overview

Policai is an Australian AI policy tracker. It maintains a curated register of AI policy, regulation, governance and court guidance across federal and state/territory jurisdictions, plus an automated "developments" feed of newly detected policy activity.

**Git is the database.** All canonical data is JSON committed to this repository (`public/data/`, `data/`). The deployed site only reads that data. [policai.org](https://policai.org) runs on the Cloudflare Worker `policai`; at build time `scripts/bundle-data.mjs` writes `data/` and `public/data/` to an asset the Worker reads, and Workers Builds redeploys on every push to `main` that changes more than `apps/probono/`, so a data commit is public once its build finishes. Collection runs daily on the maintainer's server (Argus) and opens a collection PR that auto-merges once checks pass. There is no runtime database, no auth, and no admin dashboard.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4 with CSS variables; shadcn/ui (New York) on Radix
- **Visualisations:** D3.js
- **Data:** public-safe JSON in `public/data/`; editorial and collector JSON in
  `data/`, all canonical and versioned
- **Retrieval:** plain HTTP first; self-hosted Firecrawl for `html-index` listing pages and candidate pages, falling back to headless Chromium (Playwright); RSS, register and document sources never read their own page through Firecrawl. Every path sends the collector identity `Policai/1.0 (+https://policai.org)` (`src/lib/pipeline/identity.ts`; see Collector identity below) and passes through one `HostGate` (`src/lib/pipeline/host-gate.ts`: robots.txt, a 2 s gap per host, `Retry-After`, a per-run breaker; docs/collector.md "Politeness"). Firecrawl `map` and `crawl` are not used.
- **Analysis:** keyword heuristic by default; the local `clef-flash` model on Argus (`src/lib/pipeline/clef-classify.ts`) when `USE_CLEF_CLASSIFIER=1` and the GPU and model are available, falling back to keyword rules otherwise — both classifier paths cap stored/displayed confidence at 0.65 (`MACHINE_CONFIDENCE_CAP`); direct-document change detections on tracked records store `relevanceScore: 1` by design (change-certainty, not classifier confidence) and stay editor-gated
- **Scraping:** Cheerio
- **Testing:** Vitest (+ Testing Library)
- **Hosting:** Cloudflare Workers through OpenNext (`npm run build:cloudflare`, `wrangler.jsonc`)
- **Automation:** a daily scheduled collector run on the maintainer's server

**Collector identity:** The collector identifies itself as `Policai/1.0 (+https://policai.org)` on every retrieval path. A refusal of that identity is a block we respect: the source moves to manual tracking. No source carries an identity exception; the E24 exception for 16 Commonwealth sources expired at 2026-10-21 00:00 AEDT (#162), and granting a new one needs Daniel's approval.

## Commands

```bash
npm run dev            # dev server on http://localhost:3000
npm run build          # production build
npm run lint           # ESLint (flat config)
npm run test           # Vitest
npm run validate:data  # structural validation of the data files
npm run check:freshness # overdue-review ratchet (data/freshness-budget.json)
npm run check          # lint + typecheck + test + validate:data + build — run before handing off
npm run collect        # one collection pass (-- --dry-run to preview, -- --source=<id> for one source)
npm run audit:sources  # live audit of automatic watch sources
npm run audit:register # compare curated source fingerprints
npm run mcp            # local MCP source-ingest server
npm run signal:reviews # pending cards reprint; product Signal path is HTTPS /api/signal/reviews (not this CLI)
```

## Project Structure

```text
src/
├── app/
│   ├── page.tsx                  # Policy register (server component → client PolicyBrowser)
│   ├── developments/page.tsx     # Automated developments feed
│   ├── this-week/page.tsx        # Weekly verified developments + upcoming dates
│   ├── courts/page.tsx           # Court AI guidance view
│   ├── analysis/                 # Analysis index, [slug] pieces and tombstones, feed.xml (Atom)
│   ├── coverage/                 # Coverage map: themes by jurisdiction (see Coverage map)
│   ├── timeline/                 # Timeline visualisation
│   ├── methodology|status/       # Verification method and source health
│   ├── not-found.tsx             # Site 404 with onward links
│   ├── map|framework|blog/       # Retired: each page calls notFound()
│   ├── agencies/                 # Temporary 307 to apsaitracker.app (owner's permission; force-dynamic
│   │                             #   so no CDN caches it). To withdraw, restore notFound()
│   ├── policies/[id]/            # Policy detail (server) + client tabs
│   └── api/                      # Public read API + Signal write exception:
│                                 #   policies, policies/[id], agencies, timeline, network,
│                                 #   status, developments, court-requirements (JSON),
│                                 #   policies/[id]/markdown, and signal/reviews (tokenized)
├── components/                   # UI, layout, visualisation components
├── lib/
│   ├── data-service.ts           # File-backed reads/writes over the repo JSON
│   ├── file-store.ts             # JSON I/O; reads the build-time bundle on Workers, disk elsewhere
│   ├── validate-data.ts          # Data schema enforcement (used by CI + collector)
│   ├── articles.ts               # Article frontmatter parser, standard notice text, citation state
│   ├── article-figures.ts        # Figure blocks in article bodies, register chart counts
│   ├── article-baseline.ts       # Reads the base revision of data/articles/ from Git
│   ├── analysis.ts               # Deterministic relevance/summary helpers
│   ├── related-policies.ts       # Ranked related instruments for /policies/[id] (see Related instruments)
│   ├── scraper-filter.ts         # Keyword heuristics shared by the pipeline
│   ├── source-ingest.ts          # Curated publish path (used by the MCP server)
│   └── pipeline/                 # Collector: sources.ts, extract.ts, classify.ts, clef-classify.ts, firecrawl.ts, collect.ts
├── mcp/                          # Local MCP server for staging/publishing records
└── types/index.ts                # All shared domain types

public/data/                      # Public-safe canonical data served directly
data/                             # Editorial register/data, state, reviews, coverage
data/articles/                    # Written pieces, one <slug>.md each (see Articles)
scripts/                          # collector, audits, validation, migrations
docs/                             # collector.md + docs index
```

## Data Model & Flow

1. **Register** (`data/policies.json`): curated policy records. Changed only through explicit editorial approval (human or MCP-assisted). `/data/policies.json` and API/site reads expose only verified, non-trashed, non-withheld records. The collector never writes it. The host wrapper `ops/collector/policai-collect.sh` fails a collection run that changes it. No GitHub workflow checks this, so a hand-made PR that edits the register is caught only by review.
   A `legislation` or `regulation` record may carry `legislative`: its official id (APH bill id, Federal Register title id, or a state register URL) and dated, sourced lifecycle events (introduced, referred, passed, assented, registered, tabled, commenced, amended, repealed, and the ends: lapsed, withdrawn, negatived, disallowed). `src/lib/legislation/model.ts` replays the events through one transition function; `validate:data` fails on an out-of-order event, a `status` that disagrees with the events, or a `commenced`, `amended` or `repealed` record date that is none of that kind's events. Every non-trashed `legislation` record must carry it (snapshots in approved or published source reviews are exempt); on `regulation` it is optional, because registered eSafety industry codes and consultations are not Federal Register instruments.
2. **Developments** (`data/developments.json`): automated radar feed. Each entry has provenance (`sourceId`, `url`), a relevance score, and a `classification` label — `heuristic` (deterministic keyword rules, the default) or `ai` (local Clef classification, active when `USE_CLEF_CLASSIFIER=1`), plus `curated` for promoted register entries. Both classifier paths cap confidence at 0.65 (`MACHINE_CONFIDENCE_CAP`) and show as "Needs review". Direct-document change detections on tracked records carry `relevanceScore: 1` — the score records change-certainty for a known instrument, not classifier confidence — and are equally editor-gated. `/data/developments.json` filters dismissed entries. Public feed entries render `id={development.id}` so `/developments#<id>` reveals past the other tab and filters (#223); dismissed rows never reach the browser. `docs/editorial-policy.md` allows those fragment links.
3. **Editorial directories** (`data/timeline.json`, `data/agencies.json`,
   `data/commonwealth-agencies.json`): may contain records awaiting review and
   are never served statically; `/data/*.json` route handlers apply public
   verification filters.
   The DTA framework artifact is also editorial and is withheld whenever its
   related register policy is withheld.
4. **Collector** (`src/lib/pipeline/collect.ts`): pure orchestrator — fetch sources → extract candidates → diff against `data/watch-state.json` → classify → return developments/review candidates/state/meta. The CLI (`scripts/collect.ts`) persists them. On Argus it also reads and stages the collector's host state and outbox (`POLICAI_COLLECTOR_STATE`, `scripts/collect-run.ts`), so an unmerged collection PR loses nothing. Every fresh-vs-stored fingerprint comparison uses `matchesRetrievedContent` (pending document candidates, ordered re-staging, re-approval `reviewedDate`, adoption-path snapshot gate, and register audit `--write-evidence`; #249). HTML fingerprints under the current, #244 and pre-#195 schemes stay structurally disjoint (`publicationDates` / `date-platform:` / neither), so a page that gains `dcterms.created` or a Drupal generator after its current fingerprint was stored reads as changed (#262; `docs/collector.md`).
5. **Review**: high-confidence detections are staged in `data/source-reviews.json`; a separate approval action is required before publishing creates a register record. Changed direct-document sources stage a version-specific review with `targetPolicyId`, temporarily withhold the existing policy publicly, and update that policy in place after approval.
6. **Coverage**: automatic sources report usable-content health in `public/data/meta.json`; protected sources are tracked in `data/source-monitoring.json`.
   **Reuse terms** (`data/site-reuse.json`, parsed by `src/lib/watch-coverage/site-reuse.ts`): one entry per body host with what its copyright page permits (`stated` with a Creative Commons id, `all_rights_reserved` or `custom` terms, plus `termsUrl`; or `not_stated` / `refused` with a note) and `checkedAt`. `validate:data` errors on a host no body owns and warns on an unchecked body host. Shown at `/status/reuse` and as "Site reuse terms" on `/policies/[id]`. Re-check with `npm run survey:site-reuse -- --out=<file>` on the collector host (declared identity, robots.txt, 2 s gap); the survey only gathers evidence, an editor writes the file.
   **Rule scope** (`data/rule-scope.json`, parsed by `src/lib/rule-finder/scope.ts`): one entry per register record, kept outside `policies.json` so it never changes a record's revision hash. A `rule` gives its `legalForce` (binding, government_mandatory, expectation, voluntary, proposed), the audiences it `appliesTo`, and a `scope` citation quoting the instrument's own words with a pinpoint; a `not_a_rule` entry (strategy, report, funding program) carries a note. `review` is `draft` until an editor approves it on a decision card, then `reviewed` with `reviewedBy`. Only reviewed rules reach `/rule-finder`, which returns 404 while there are none. `validate:data` errors on an unknown record or a proposed record not marked proposed, and warns with a count of unscoped records. The finder reports what an instrument says about whom it covers; it never says whether a reader complies.
7. **Freshness**: register source fingerprints are checked with `npm run audit:register`; changed content marks a record stale until editorial re-verification. Separately, a record whose manual verification is older than 90 days stays public but is shown as "Review due"; `npm run check:freshness` (CI, weekly) fails when overdue records exceed the ratchet in `data/freshness-budget.json`.

8. **Articles** (`data/articles/<slug>.md`): Policai's written analysis. See Articles below.

See [docs/collector.md](./docs/collector.md) for operations.

## Coverage map

`/coverage` answers "who has an instrument on this subject, and where is
there nothing?" as a table of themes (rows) by jurisdiction (columns). The
nav calls it Coverage map, a view of the Register
(`src/lib/site-nav.ts`). `/network` and any query string on it
redirect there with a 308 (`next.config.ts`). `/api/network` is unchanged
and still serves `buildNetworkData` nodes and edges.

- **Data:** `buildCoverageData(policies, THEMES)` in `src/lib/coverage-data.ts`
  is pure. It counts the public register read (`getPolicies()`: verified,
  non-trashed, non-withheld) per `policy.themes` entry and jurisdiction, and
  per `policy.type` for the "By instrument type" axis on the same code path.
  Each cell holds record ids. Columns follow `COVERAGE_JURISDICTIONS`
  (Federal, NSW, Vic, Qld, SA, WA, Tas, ACT, NT). Rows are sorted by total,
  then label. A theme is charted when it has `COVERAGE_MIN_RECORDS` records.
  The value is 1, so every theme in the controlled vocabulary with a public
  record is a row: `validate:data` requires two non-trashed register records
  per theme (fewer than two public records is only a warning), and a hidden
  theme cannot show where coverage is missing. The
  original threshold of 6 filtered free-form tags. Raise it if the
  vocabulary grows past what one table can show; uncharted themes are then
  counted in the footnote.
- **Rendering:** the route is `force-dynamic`. It reads `searchParams` to
  server-render the selected drill-down, so it is dynamic by nature, and the
  export says so; a `revalidate` would have no effect. Each request reads
  `policies.json` and `source-reviews.json` through the public `getPolicies()`
  projection and builds the matrix, which is small (one pass over the public
  records). `src/app/coverage/page.test.tsx` guards the export, asserts SSR
  table HTML, and asserts that withheld, unverified and trashed records never
  reach a cell or a drill-down list.
- **Copy:** every count and sentence on the page (standfirst, footnote, empty
  state) comes from `coverageStandfirst`, `coverageFootnote` and
  `coverageEmptySentence`. Do not type numbers into the page. The footnote
  agrees in number for 0, 1, 2 and many themes; its cases are a table in
  `coverage-data.test.ts`. An empty register must read "None of the N themes
  … has a verified record yet". Clauses join with "; ", so a threshold-6 empty
  chart does not run "and" between the below-threshold and unused groups.
- **URL:** `?theme=<key>&j=<jurisdiction>` selects a cell, `theme` alone a row,
  `j` alone a column, and `by=type` (with `type=<key>`) switches the axis.
  Unknown values are ignored. Opening and closing use `replaceState`; moving
  from one selection to another uses `pushState`, so Back restores it
  (`coverage-map.test.tsx`). `/coverage` is in `sitemap.ts`
  (`sitemap.test.ts`).
- **Markup:** one server-rendered `<table>` from the client component
  `CoverageMap` (`src/components/coverage-map.tsx`). Count cells are buttons
  in a roving-tabindex grid: one tab stop, arrows, Home and End, Enter or
  Space to open the drill-down row under the selection, Escape or "Clear
  selection" to close it and return focus. Below 768px the same rows are
  restyled as CSS grid strips. Changing `display` on table elements drops
  their table semantics in some browsers, so every table element carries its
  explicit ARIA role (`table`, `rowgroup`, `row`, `columnheader`,
  `rowheader`, `cell`). A selection loaded from the URL scrolls the
  drill-down row into view (the `<tr class="coverage-drill-row">`, not the
  inner `.coverage-drill` panel — putting `scroll-margin-top` only on the
  panel left shared phone links under the sticky header and column strip,
  #329). The browser adds the row's `scroll-margin-top`
  to the document's `scroll-padding-top` (`--scroll-clear-top` in
  `globals.css`: `6.5rem`, and `9rem` from `min-width: 40rem`), so the
  margin is the clearance wanted, the site header height
  (`--coverage-sticky-top`) plus, below 768px, the sticky column strip
  (`--coverage-strip-height`) plus `--space-2`, minus `--scroll-clear-top`.
  `CoverageMap` measures both heights before it scrolls and again when either
  element resizes (`ResizeObserver` with `box: 'border-box'`, so a
  border or padding change on either sticky element is observed). Below
  768px the drill-down head stacks "Clear selection" under the heading, so
  the fixed "Scroll to top" button at the bottom right never covers it.
  From 768px the clear control stays in the head row and uses padding so
  its hit target clears that button. `coverage-css.test.ts` evaluates those
  CSS rules, so a change to the margin, the scroll-padding or the head
  layout fails CI, and asserts that padding plus margin still equals header
  (+ strip below 768px) + `--space-2`, and pins the stacked head and
  clear-button hit target; `coverage-map.test.tsx` pins what `CoverageMap`
  observes and that the observer uses `border-box`.
  `scripts/verify-coverage.mjs` is not in CI. It checks on phone and
  desktop, light and dark, that the drill-down heading clears both after a
  deep link and a click, sits within 48px of the strip on a phone, and (at
  430x932 and 768x1024) that "Clear selection" is clear of "Scroll to top":
  `POLICAI_VERIFY_URL=http://127.0.0.1:<port> POLICAI_EVIDENCE_DIR=<dir>
  node scripts/verify-coverage.mjs` against a loopback production build.
- **Styling:** `src/app/coverage/coverage.css`. The four cell levels are
  `color-mix()` of `--primary` into `--background`, local to the page.

## Related instruments

`/policies/[id]` lists the instruments related to a record under its summary.
`relatedInstruments(policy, publicPolicies)` in `src/lib/related-policies.ts`
is pure. It runs `buildNetworkData` over the public read (`getPolicies()`)
and takes `getNetworkConnections` for the record: two shared themes in one
jurisdiction, three across jurisdictions. A record with no connection renders
no heading.

- **Order:** a superseding or superseded record first ("Superseded by" or
  "Supersedes", in `--status-repealed`), then neighbours by shared-theme
  count, descending. Ties go to a record in the viewed record's jurisdiction,
  then the newest primary date, then the title in `en-AU` order. A superseded
  record appears once. `related-policies.test.ts` pins every tie-breaker.
- **Shares line:** the shared themes in the viewed record's theme order.
- **Counts:** the list and the "Show all N related" total come from the
  data, so they move with the theme vocabulary. #303 cited 24 related items
  for `federal-court-gpn-ai`; that predates #307 and the page computes the
  number.
- **Rendering:** the server renders every item and the first eight are in
  the HTML. Only `src/components/related/expandable-list.tsx` is a client
  component (the expander). Do not re-add a `loading.{tsx,ts,jsx,js}` in
  `src/app/policies/[id]/` or any parent segment up to `src/app`: React
  outlines a Suspense boundary that large into hidden segments that a script
  reveals, so without JavaScript the page stayed on its skeleton and showed
  6 of the 8 items. Trade-off: a first uncached client navigation keeps the
  previous page until the server renders (about 40 to 80 ms; no pending cue).
  `no-route-boundary.test.ts` guards the route and its parents, and
  `scripts/verify-related.mjs` checks the rendered page with and without
  JavaScript, light and dark, at 1440x900 and 390x844 (it is not in CI):
  `POLICAI_VERIFY_URL=http://127.0.0.1:<port> POLICAI_EVIDENCE_DIR=<dir>
  node scripts/verify-related.mjs` against a loopback production build.

## Articles

Pieces are Markdown files with YAML frontmatter, parsed by `parseArticle` in
`src/lib/articles.ts` into `Article` (`src/types/index.ts`), a union on
`status`. Frontmatter goes through `parseFrontmatter` (`src/lib/frontmatter.ts`),
which accepts YAML only: any other fence language, such as `---js` or
`---json`, is a parse error and is never evaluated. Every gray-matter call
uses it. The rules for voice, formats and citations are in
`docs/editorial-policy.md`. The tier is described in `docs/trust-model.md`.

- **Frontmatter:** `type` (`weekly_briefing | instrument_note | explainer`),
  `title`, `summary`, `status` (`draft | published | withdrawn`),
  `publishedAt`, `updatedAt`, `cites` (policy ids), `sources` (https URLs on
  official hosts) and `corrections` (`{ date, text }`). A withdrawn piece also
  needs `withdrawnAt` and `withdrawnReason`. Dates are `YYYY-MM-DD`. Any other
  key is an error.
- **Rendered from code:** the "Analysis" tier label, the "Policai" byline,
  the AI disclosure and the not-legal-advice notice (`ARTICLE_*` in
  `articles.ts`, verbatim from the editorial policy). Pieces do not carry
  them, so a published piece cannot lack them.
- **Reads:** `getArticles` (published only, filterable by `type` or
  `citing`) and `getArticleBySlug` (published or withdrawn) in
  `data-service.ts`. Drafts are never served. Each citation is classified
  against the public policy read: `current`, `review_due` or `not_public`.
  Anything other than `current` shows the "Source under review" banner. A
  `not_public` record is shown without its title or link.
  `POLICAI_ARTICLES_DIR` points reads at another directory, for previews
  with fixtures (`src/test/fixtures/articles/`).

- **Body links:** a link is on-site only when it starts with `/` or `#`, or
  is absolute, and resolves to `https://policai.org`. Protocol-relative
  (`//host/...`) and backslash (`/\host/...`) forms resolve to another host,
  so they count as external and must be listed in `sources`.

`npm run validate:data` (`validateArticles`) enforces these rules:

| Rule | Result |
| --- | --- |
| Frontmatter fails to parse, or a published piece has no `cites` | error |
| Withdrawn piece without `withdrawnAt` or `withdrawnReason` | error |
| Body link to `/policies/<id>` not in `cites`, or external link not in `sources` | error |
| Citation to a missing or trashed record | error |
| Added citation to a withheld, unverified or review-due record | error |
| Existing citation to a record that is now withheld, unverified or review-due | warning, banner shows |
| Published or withdrawn piece deleted, returned to draft, re-dated, or a withdrawn piece republished | error |
| An earlier correction changed or removed (corrections are append-only) | error |

Citations are checked one by one (`articleCitationReport` in
`validate-data.ts`), not per piece (PM, 2026-10-16). A citation is added when
the piece's `cites` on the base revision lacks it. Every citation of a new
piece, or of a piece that was a draft on the base, is added. An existing
citation never blocks an edit, so a correction or update can always be
appended to a piece whose source went under review. The base revision is
`GITHUB_BASE_SHA` when set (CI passes the PR base),
otherwise the merge-base of `HEAD` and `origin/main`. When `GITHUB_BASE_SHA`
is set but cannot be read, `validate:data` fails, so the transition rules
never pass silently. When it is unset and no merge-base can be read, every
piece counts as new.

### Article figures

A piece may carry figures as fenced `figure` blocks in its body, written as
YAML. `parseArticleBody` in `src/lib/article-figures.ts` (called by
`parseArticle`) splits the body into prose and figure blocks
(`Article.blocks`), numbers figures per piece in document order and parses
each into `ArticleFigure`, a union on `kind`. Only a fence at column 0 that
opens with exactly ```` ```figure ```` is a figure. One inside another code
fence is example text. One that is indented, or inside a list or blockquote,
is a validation error, because Markdown would render it as a code block.
Reference-style link definitions are copied to every prose block, because
each block renders on its own.

Figure YAML and frontmatter are parsed by `parseYaml` in
`src/lib/frontmatter.ts` with the YAML core schema, so dates stay text and
must be real calendar dates: `2026-02-30` is an error, not 2 March (js-yaml
default schema would roll that to 2 March; #282). A figure block is one YAML
document, so a `---` line inside it is an error instead of ending the block
early and silently dropping later fields (#282). Matrix column names, matrix
row headers and timeline date-and-title pairs must not repeat (duplicate React
keys otherwise; #282).

| Field | Kinds | Rule |
| --- | --- | --- |
| `kind` | all | `timeline`, `matrix`, `flow` or `chart` |
| `title` | all | required, at most 100 characters; states the point |
| `alt` | all | required, at least 20 characters; rendered as the figure's description |
| `caption` | all | required |
| `cites` | timeline, matrix, flow | each id must also be in the piece's `cites`; a chart lists none |
| `sources` | all | each URL must also be in the piece's `sources` |
| `wide` | matrix, flow | breaks out to 880px at 1024px and wider |
| `asAt`, `entries` | timeline | data date; 2 to 7 entries of `date` (`YYYY-MM-DD`, `YYYY-MM` or `YYYY`), `title`, optional `detail`, in date order. An entry dated after `asAt` shows as not yet in effect |
| `columns`, `rows` | matrix | 2 to 5 columns; 2 to 9 rows, each a list with one cell per column. The first cell is the row header. A cell is text, `~` (rendered "Not stated") or `{ text, emphasis: true }`, at most one emphasis per row |
| `steps`, `branch` | flow | 3 to 6 steps counting the branch. A step is `text`, optional `role` (`step`, `decision`, `end`) and optional `label` on its incoming connector. One optional `branch: { from, label, steps }`, where `from` is the number of a decision step |
| `group`, `where`, `highlight` | chart | `group` is `jurisdiction`, `type` or `status`. `where` filters on those fields (one value or a list) and `effectiveDate: { from, to }`. `highlight` is one value of the group |

Citations: because figure `cites` must be in the frontmatter `cites`, the
added-citation rule, the warnings and the "Source under review" banner apply
to them unchanged. The source line links each cited record by its title (a
record that is not public shows as "Register record under review") and each
source by its host name.

Charts count the public register when the page renders (`registerChart`,
over the same public projection as `/data/policies.json`), so withheld,
unverified and trashed records are never counted. A chart cites the register
as a whole, not the records it counts: a review-due record in the count
raises no error and no banner (PM, 2026-10-17). Its source line reads
"Policai register, N public records, as at <date>", where the date is the
date the page was generated, as a calendar date in Australia/Sydney (Daniel,
2026-10-17, #293; supersedes the collection/`lastHealthyAt` date from #282).
`readPublicArticles` takes it from the same `now` that builds the public
projection it counts, so the date is when the count was taken and reveals
nothing about hidden records. `/analysis/[slug]` prerenders every published piece at build
(`generateStaticParams` over `getArticles()`, `revalidate` 3600), so the
count and its date come from the deploy that built the page (Dan,
2026-10-26, #560; supersedes the per-request render). The count stays true
for that date because the data only changes through commits, and every
commit redeploys. On Workers a per-request render cost 440 to 655 ms of CPU.
A test in `src/app/analysis/article-figures.test.tsx` fails if the
route exports `dynamic` again or `generateStaticParams()` drops the
`figure-kinds-published` fixture.
The date is formatted
in the server render, so a reader's timezone cannot change it.
`validateArticles` (`registerChartErrors`) fails a
published chart whose query matches no public record, gives fewer than 3 or
more than 10 bars, or highlights a value with no records. The prose must not
restate a chart's numbers, since they change as the register changes.

`src/components/article-figures.tsx` renders figures as server HTML and CSS
only, with no SVG, canvas, images or client script. Their styles are the
`.figure` rules in `src/app/globals.css` and use design tokens only. Fixtures
for every kind and every validation rule are in `src/test/fixtures/articles/`
(`figure-*.md`, `invalid-figure-*.md`).

### Article images

A piece may carry an `image` object in its frontmatter. It is parsed by
`parseArticle` into `ArticleImage` (`src/types/index.ts`). Fields: `src`
(`/images/articles/<slug>/<file>`, jpg, png or webp), `alt`, `width`,
`height`, `title`, `creator`, `sourceUrl` (https), `licence`, `licenceUrl`,
`licenceCheckedAt` (date, not after today in Australia/Sydney) and the
optional `creatorUrl` (https) and `modifications` (for example `cropped`).

The licence is a table lookup (`ARTICLE_LICENCE_RULES` in
`src/lib/article-licences.ts`). `licenceUrl` must equal the canonical URL for
the `licence` id. NC, ND and every other id are rejected, as is a version
Creative Commons never published (for example `CC-BY-9.9`).

| `licence` | `licenceUrl` | Attribution wording |
| --- | --- | --- |
| `CC0-1.0` | `https://creativecommons.org/publicdomain/zero/1.0/` | dedicated to the public domain under CC0 1.0 |
| `PDM-1.0` | `https://creativecommons.org/publicdomain/mark/1.0/` | marked with Public Domain Mark 1.0 |
| `CC-BY-<v>` | `https://creativecommons.org/licenses/by/<v>/` | licensed under CC BY `<v>` |
| `CC-BY-SA-<v>` | `https://creativecommons.org/licenses/by-sa/<v>/` | licensed under CC BY-SA `<v>` |
| `CC-BY-<p>-AU` | `https://creativecommons.org/licenses/by/<p>/au/` | licensed under CC BY `<p>` AU |
| `CC-BY-SA-<p>-AU` | `https://creativecommons.org/licenses/by-sa/<p>/au/` | licensed under CC BY-SA `<p>` AU |

`<v>` is 1.0, 2.0, 2.5, 3.0 or 4.0. `<p>` is an Australian port version:
2.0, 2.1, 2.5 or 3.0. Other jurisdiction ports are rejected until a piece
needs one; add it to `CC_PORTS` with the versions Creative Commons published.

Some image hosts use their own licences, not Creative Commons, so a CC label
on their images cannot be true. `DISALLOWED_IMAGE_HOSTS` (also in
`article-licences.ts`) lists them with the reason, and a `sourceUrl` or
`creatorUrl` on a listed host or any of its subdomains is an error whatever
the `licence`.

| Host | Reason |
| --- | --- |
| `unsplash.com` | The Unsplash Licence is not a Creative Commons licence. |
| `pexels.com` | The Pexels Licence is not a Creative Commons licence. |

`validateArticles` also checks the file in `public/` (`article-images.ts`):
it exists, is a readable image whose format matches its extension (a
`.jpg` file must hold JPEG data), matches the declared `width` and `height`
(after EXIF orientation), has a long edge of 2048 to 2560 px and is at most
1,200,000 bytes. A file under `public/images/articles/` that no article's
`image.src` uses is an orphan and an error. These checks apply to every
status and to untouched pieces. `sharp` is a devDependency for them (it is
already in the tree through `next`).

The lead image on `/analysis/[slug]` and the thumbnail on `/analysis` use
`next/image` with the declared size and `sizes`, so the page does not shift.
A TASL line under the lead image links the title (source page), creator and
licence, words the licence as the table above shows, and adds
"Modified: ..." when `modifications` is set. The image is the `og:image` and
`twitter:image`, and the Article JSON-LD `image` (`ImageObject` with
`license` and `creditText`). The JSON-LD names the creator only in
`creditText`, because a creator may be a person or an organisation.

`npm run add:article-image -- <url> <slug>` downloads the original over
https with the collector identity `User-Agent` (`COLLECTOR_USER_AGENT`).
It follows at most five redirects, each to https on the same host and
port; any other redirect is refused, so pass the final image URL. The
download must finish within 30 seconds and stay within 64 MB, counted while
it streams. It accepts only JPEG, PNG, WebP and TIFF input (no SVG or GIF)
of at most 100 megapixels. It refuses an original under 2048 px on its long edge, applies EXIF orientation,
re-encodes at a 2048 px long edge (quality 82, lowered in steps to 70 if the
file would exceed the size limit), strips metadata and writes
`public/images/articles/<slug>/lead.jpg`. It writes a temporary file in the
same folder and renames it into place, so a failed run leaves no partial file.
It refuses to overwrite an existing `lead.jpg`, because validation matches the
file to its frontmatter only by size and a new image would keep the old
attribution. Remove the file and its `image` attribution deliberately, or pass
`--replace` (`npm run add:article-image -- <url> <slug> --replace`) and update
every attribution field for the new image. It prints a frontmatter stub with
`alt`, `title`, `creator`, `creatorUrl`, `sourceUrl`, `licence`,
`licenceUrl`, `modifications` and `licenceCheckedAt` empty. It never infers
licence data: a person fills them in from the source page, then deletes the
optional keys they do not use. The stub fails `validate:data` until then.

## Key Domain Types

Defined in `src/types/index.ts`; import them from `@/types`. The one exception is `ThemeId`, which `src/lib/themes.ts` defines next to its vocabulary; import it, `THEMES` and the theme helpers from `@/lib/themes`.

- **Jurisdiction:** `federal | nsw | vic | qld | wa | sa | tas | act | nt`
- **PolicyType:** `legislation | regulation | guideline | framework | standard | practice_note | policy | tool | funding_program`
- **PolicyStatus:** `proposed | active | amended | superseded | closed | repealed | trashed` (unverified and `trashed` records are hidden from public register reads; `superseded` records carry `supersededBy`)
- **Policy** — register entity (with optional `supersededBy`, `lastReviewedAt`)
- **ThemeId** — `Policy.themes[]` entries: keys of `THEMES` in `src/lib/themes.ts`, the controlled topic vocabulary the Editorial Manager owns (issue #305). Every record, trashed or not, has 1 to 5 unique themes. A listed theme on fewer than 2 non-trashed register records is a `validate:data` error. A listed theme on fewer than 2 public records is only a warning, because withholding a record for an update review, or an unverified record, can cause it during an ordinary collection run. The real-data test (`src/lib/validate-themes.test.ts`) asserts the register count only, so CI fails on the same condition as `validate:data`. Adding, renaming or removing a theme is an editorial decision made in a PR that edits `src/lib/themes.ts`. A new theme must be on at least 2 records in the same PR. Renaming or removing a theme needs a data migration of `data/policies.json` in the same PR: a rerunnable codemod like `scripts/apply-themes-2026-10-17.ts`. `tags` stay free-form keywords for search, `keywords` metadata, related records and the courts view; they are not themes. `/coverage` charts records by `themes` and jurisdiction, and `/api/network` connects records that share `themes`.
- **PolicyDate** — `Policy.dates[]` entries: `type` (`POLICY_DATE_TYPES`), calendar `date`, required `precision` (`day | month | year`; month/year dates anchor on the first day and never render a day), optional `primary` and `source`. Exactly one date is primary and backs `effectiveDate`.
- **Deadline date types** (`DEADLINE_DATE_TYPES`): `consultation_closed | compliance_due | scheduled_review` — dates that fall due on an instrument rather than change it. They cannot be primary; future ones feed the homepage "Upcoming deadlines" rail and `/this-week` (`src/lib/this-week.ts`). Values are editorial, source-verified entries like any other date.
- **Development**, **CollectionMeta** — feed + collector metadata
- **TimelineEvent**, **Agency**, **SourceReview**, **McpAuditLog**

Use the display-name helpers (`getPolicyTypeName()`, `getPolicyStatusName()`, `getJurisdictionName()`) for untrusted strings, and the `--status-*` colour tokens from `design/tokens.css` (the `StatusPill` in `src/components/policy-indicators.tsx` applies them).

## Environment Variables

None are required to run the site or collector. Optional (see `.env.example`):

```bash
POLICAI_SIGNAL_TOKEN=     # HTTPS /api/signal/* Bearer token (Grok Bot product path)
POLICAI_SIGNAL_GITHUB_TOKEN= # Worker secret; Signal POST reads GitHub main and commits changed files as a PR (or main push); never writes the checkout
POLICAI_SIGNAL_REVIEWERS= # allowlist for Signal reviewer (default: Daniel Alkurdi,Daniel)
POLICAI_MCP_WRITE=        # 1 = npm run mcp registers its write tools; unset, the server is read-only
POLICAI_MCP_ADMIN_TOKEN=  # signal:reviews recovery apply only (laptop recovery; not the bot path)
USE_CLEF_CLASSIFIER=      # 1 = score relevance with local clef-flash instead of keyword rules (collection host only)
FIRECRAWL_URL=            # self-hosted Firecrawl base URL, defaults to http://127.0.0.1:3003
POLICAI_ARTICLES_DIR=     # read articles from this directory instead of data/articles (previews only)
```

Clef needs no key: it talks only to Ollama on `127.0.0.1:11434`. The retired cloud variables (`USE_CLAUDE_CLASSIFIER`, `CLASSIFIER_BASE_URL`, `CLASSIFIER_API_KEY`) make the host wrapper refuse to run.

## Editing Data

- Change the relevant canonical file in `public/data/` or `data/` (or use the
  MCP tools), then run `npm run validate:data`.
- Every policy needs a real, verified `sourceUrl` (https, `.gov.au` or allow-listed host) and accurate dates — if a day-level date can't be verified, say so in `content` rather than inventing precision.
- Mark replaced instruments `superseded` (+ `supersededBy`) and dead consultations `closed`; don't delete history.
- Stamp `lastReviewedAt` when you have verified a record against its source.
- Give every policy 1 to 5 `themes` from `src/lib/themes.ts`. Collector and staged drafts carry `themes: []`, and approval and publication refuse a policy without themes, so propose a new policy (`propose_source_decision`) with an explicit `proposedRecord` that sets them. Re-verification drafts keep the record's existing themes. `npm run validate:data` runs both `validatePolicyThemes` and `validateThemeCoverage` (`scripts/validate-data.ts`; `src/lib/validate-data-script.test.ts` fails if either call is removed). Publication also refuses an approved snapshot whose themes were emptied, set to an unknown id, omitted, nested (a non-string entry is named by type and JSON value, not as an unknown theme id), or grown past five, and does not call `createPolicy` or `updatePolicy` (`src/lib/source-ingest-workflow.test.ts`). Through MCP, `list_themes` (read-only) returns each key and label from `THEMES` with the per-record and per-theme limits. When a record has theme errors, the last error for that record ends with `; valid theme ids are <keys>` (not a separate `<id>: valid theme ids are <keys>` line). Approve and publish refusals join those errors, so they name the keys too.

## Code Conventions

- PascalCase components; camelCase functions/variables; types centralised in `@/types`.
- Use `readJsonFile`/`writeJsonFile` from `@/lib/file-store`; `cleanHtmlContent`/`extractJsonFromResponse` from `@/lib/utils`.
- Public pages read via `src/lib/data-service.ts` server-side; keep interactive parts in client components fed by server props.
- API routes are read-only and export named HTTP methods with `NextResponse.json()`.
- The header strip shows `meta.lastCollectedAt` through
  `collectionStripProps` and `formatCollectedAt` in
  `src/lib/collection-strip.ts` (a plain module, so the server layout may call
  them), pinned to `Australia/Sydney`. It never shows `lastHealthyAt`, which
  would date the strip to the last fully healthy run (#304). Below `sm` a
  degraded run still shows a `degraded` marker beside the collected date.
  `formatCollectedAt` falls back when the stamp is missing or unparseable.
- A server module (one without `'use client'`) imports only components from a
  `'use client'` module. Any other value it imports, such as a string or a
  function, becomes a client reference in the RSC payload, which the browser
  resolves only after that module's chunk loads. Put shared values in a plain
  module instead. `src/app/client-boundary.test.ts` enforces this. A client
  reference inside `<head>` caused #284: when it suspended during hydration,
  React replayed the `<head>` singleton and lost its place in the document, so
  about 0.2% of loads (several percent under CPU load) failed with React #418.
- Theme: `src/components/layout/theme-init.ts` holds the storage key and the
  static init script. The root layout renders the script in `<head>` so a
  stored light or dark choice applies before first paint, with no flash of the
  system theme. `<html data-theme>` is the single source of truth: the script
  sets it, `ThemeToggle` reads it through `useSyncExternalStore` and its
  selection updates it, so every toggle on the page agrees. The server renders
  the system option because it cannot know the stored choice. Storage can be
  unavailable (private mode, blocked cookies); the choice then applies to the
  current page view only.
- Run `npm run check` before handing off or committing.

## Pull requests and review

No automated review runs on PRs. Reviews are requested by hand, and auto-merge does not wait for one.

- Put the `hold` label on a PR that must wait for a review, a date or an event, or auto-merge lands it once CI is green.
- When a review is posted, address it before merging: fix every blocker it names; for a non-blocking note, fix it once if the fix is cheap, or reply on the thread with the reason and resolve it.
- Never push only because of a note you have already seen or handled. Batch fixes into one push.
- Never post an approving review. Merging needs the required checks green and every review thread resolved.

## Documentation Standard

Keep docs HADS-aligned:

- **Honest:** describe the code that exists now; call out legacy names instead of pretending they are current.
- **Actionable:** include exact commands, paths, environment variables, and verification steps.
- **Durable:** avoid vendor/model claims that drift quickly unless the code depends on them.
- **Specific:** prefer concrete project paths and behaviours over generic advice.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
