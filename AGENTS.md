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
cross-application change. Keep production runtimes independent. Never push a
production-targeted branch without checking the current automatic deployment
timer: a source push can trigger an installed host deployment job.

## Shared design tokens

`design/tokens.css` is the single source for values both sites share: type
scale (`--type-*`, `--tracking-eyebrow`), font roles (`--font-sans`,
`--font-display`, `--font-mono`), spacing (`--space-*`), radii
(`--radius`, `--radius-control`, `--radius-pill`), focus ring
(`--focus-ring-*`), core, status and row-hover colours, rules, shadows and
motion. The
A2J Docker build sees only `apps/probono/dashboard`, so neither app imports
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

**Git is the database.** All canonical data is JSON committed to this repository (`public/data/`, `data/`). The deployed site only reads that data. It is self-hosted at [policai.org](https://policai.org) behind a Cloudflare tunnel. Collection runs daily on the maintainer's server, in a checkout separate from the one that serves the site, and pushes new detections to GitHub; the serving checkout pulls those commits and serves them through ISR without a rebuild. There is no runtime database, no auth, and no admin dashboard.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4 with CSS variables; shadcn/ui (New York) on Radix
- **Visualisations:** D3.js
- **Data:** public-safe JSON in `public/data/`; editorial and collector JSON in
  `data/`, all canonical and versioned
- **Retrieval:** plain HTTP first; self-hosted Firecrawl for candidate pages on browser-strategy sources, falling back to headless Chromium (Playwright); index and RSS listing pages always use headless Chromium directly. Every path sends the collector identity `Policai/1.0 (+https://policai.org)` (`src/lib/pipeline/identity.ts`; see Collector identity below)
- **Analysis:** keyword heuristic by default; Claude, an Anthropic model, batched through an OpenAI-compatible chat-completions endpoint (`src/lib/pipeline/classifier-cli.ts`) when `USE_CLAUDE_CLASSIFIER` is set — both classifier paths cap stored/displayed confidence at 0.65 (`MACHINE_CONFIDENCE_CAP`); direct-document change detections on tracked records store `relevanceScore: 1` by design (change-certainty, not classifier confidence) and stay editor-gated
- **Scraping:** Cheerio
- **Testing:** Vitest (+ Testing Library)
- **Automation:** a daily scheduled run on the maintainer's server

**Collector identity:** The collector identifies itself as `Policai/1.0 (+https://policai.org)` on every retrieval path. A refusal of that identity is a block we respect: the source moves to manual tracking. Time-boxed exception: 16 Commonwealth sources keep a plain browser UA until 2026-10-21 while an allow-list request is pending (E24).

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
│   ├── network|timeline/         # Visualisations
│   ├── methodology|status/       # Verification method and source health
│   ├── not-found.tsx             # Site 404 with onward links
│   ├── map|framework|blog/       # Retired: each page calls notFound()
│   ├── agencies/                 # Temporary 307 to apsaitracker.app (owner's permission; force-dynamic
│   │                             #   so no CDN caches it). To withdraw, restore notFound()
│   ├── policies/[id]/            # Policy detail (server) + client tabs
│   └── api/                      # READ-ONLY public API, one route.ts each:
│                                 #   policies, policies/[id], agencies, timeline, network,
│                                 #   status, developments, court-requirements (JSON), and
│                                 #   policies/[id]/markdown (text/markdown)
├── components/                   # UI, layout, visualisation components
├── lib/
│   ├── data-service.ts           # File-backed reads/writes over the repo JSON
│   ├── validate-data.ts          # Data schema enforcement (used by CI + collector)
│   ├── articles.ts               # Article frontmatter parser, standard notice text, citation state
│   ├── article-baseline.ts       # Reads the base revision of data/articles/ from Git
│   ├── analysis.ts               # Deterministic relevance/summary helpers
│   ├── scraper-filter.ts         # Keyword heuristics shared by the pipeline
│   ├── source-ingest.ts          # Curated publish path (used by the MCP server)
│   └── pipeline/                 # Collector: sources.ts, extract.ts, classify.ts, claude-classify.ts, classifier-cli.ts, firecrawl.ts, collect.ts
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
2. **Developments** (`data/developments.json`): automated radar feed. Each entry has provenance (`sourceId`, `url`), a relevance score, and a `classification` label — `heuristic` (deterministic keyword rules, the default) or `ai` (Claude classification, active when `USE_CLAUDE_CLASSIFIER` is set), plus `curated` for promoted register entries. Both classifier paths cap confidence at 0.65 (`MACHINE_CONFIDENCE_CAP`) and show as "Needs review". Direct-document change detections on tracked records carry `relevanceScore: 1` — the score records change-certainty for a known instrument, not classifier confidence — and are equally editor-gated. `/data/developments.json` filters dismissed entries.
3. **Editorial directories** (`data/timeline.json`, `data/agencies.json`,
   `data/commonwealth-agencies.json`): may contain records awaiting review and
   are never served statically; `/data/*.json` route handlers apply public
   verification filters.
   The DTA framework artifact is also editorial and is withheld whenever its
   related register policy is withheld.
4. **Collector** (`src/lib/pipeline/collect.ts`): pure orchestrator — fetch sources → extract candidates → diff against `data/watch-state.json` → classify → return developments/review candidates/state/meta. The CLI (`scripts/collect.ts`) persists them.
5. **Review**: high-confidence detections are staged in `data/source-reviews.json`; a separate approval action is required before publishing creates a register record. Changed direct-document sources stage a version-specific review with `targetPolicyId`, temporarily withhold the existing policy publicly, and update that policy in place after approval.
6. **Coverage**: automatic sources report usable-content health in `public/data/meta.json`; protected sources are tracked in `data/source-monitoring.json`.
7. **Freshness**: register source fingerprints are checked with `npm run audit:register`; changed content marks a record stale until editorial re-verification. Separately, a record whose manual verification is older than 90 days stays public but is shown as "Review due"; `npm run check:freshness` (CI, weekly) fails when overdue records exceed the ratchet in `data/freshness-budget.json`.

8. **Articles** (`data/articles/<slug>.md`): Policai's written analysis. See Articles below.

See [docs/collector.md](./docs/collector.md) for operations.

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

Defined in `src/types/index.ts` — always import from `@/types`:

- **Jurisdiction:** `federal | nsw | vic | qld | wa | sa | tas | act | nt`
- **PolicyType:** `legislation | regulation | guideline | framework | standard | practice_note | policy | tool | funding_program`
- **PolicyStatus:** `proposed | active | amended | superseded | closed | repealed | trashed` (unverified and `trashed` records are hidden from public register reads; `superseded` records carry `supersededBy`)
- **Policy** — register entity (with optional `supersededBy`, `lastReviewedAt`)
- **PolicyDate** — `Policy.dates[]` entries: `type` (`POLICY_DATE_TYPES`), calendar `date`, required `precision` (`day | month | year`; month/year dates anchor on the first day and never render a day), optional `primary` and `source`. Exactly one date is primary and backs `effectiveDate`.
- **Deadline date types** (`DEADLINE_DATE_TYPES`): `consultation_closed | compliance_due | scheduled_review` — dates that fall due on an instrument rather than change it. They cannot be primary; future ones feed the homepage "Upcoming deadlines" rail and `/this-week` (`src/lib/this-week.ts`). Values are editorial, source-verified entries like any other date.
- **Development**, **CollectionMeta** — feed + collector metadata
- **TimelineEvent**, **Agency**, **SourceReview**, **McpAuditLog**

Use the display-name helpers (`getPolicyTypeName()`, `getPolicyStatusName()`, `getJurisdictionName()`) for untrusted strings, and the `--status-*` colour tokens from `design/tokens.css` (the `StatusPill` in `src/components/policy-indicators.tsx` applies them).

## Environment Variables

None are required to run the site or collector. Optional (see `.env.example`):

```bash
POLICAI_MCP_ADMIN_TOKEN=  # local MCP source-ingest writes
USE_CLAUDE_CLASSIFIER=    # opt into Claude classification instead of the keyword heuristic (set on the collection host)
FIRECRAWL_URL=            # self-hosted Firecrawl base URL, defaults to http://127.0.0.1:3003
CLASSIFIER_BASE_URL=      # chat-completions base URL used when USE_CLAUDE_CLASSIFIER is set
CLASSIFIER_API_KEY=       # bearer token for that endpoint
CLASSIFIER_MODEL=         # model id sent with each request
POLICAI_ARTICLES_DIR=     # read articles from this directory instead of data/articles (previews only)
```

Classification needs all three `CLASSIFIER_*` variables. A missing one raises `ClaudeAuthError` before any request is sent. Keep the key in the host environment, never in the repo. Tests clear all three in `vitest.setup.ts`.

## Editing Data

- Change the relevant canonical file in `public/data/` or `data/` (or use the
  MCP tools), then run `npm run validate:data`.
- Every policy needs a real, verified `sourceUrl` (https, `.gov.au` or allow-listed host) and accurate dates — if a day-level date can't be verified, say so in `content` rather than inventing precision.
- Mark replaced instruments `superseded` (+ `supersededBy`) and dead consultations `closed`; don't delete history.
- Stamp `lastReviewedAt` when you have verified a record against its source.

## Code Conventions

- PascalCase components; camelCase functions/variables; types centralised in `@/types`.
- Use `readJsonFile`/`writeJsonFile` from `@/lib/file-store`; `cleanHtmlContent`/`extractJsonFromResponse` from `@/lib/utils`.
- Public pages read via `src/lib/data-service.ts` server-side; keep interactive parts in client components fed by server props.
- API routes are read-only and export named HTTP methods with `NextResponse.json()`.
- Run `npm run check` before handing off or committing.

## Documentation Standard

Keep docs HADS-aligned:

- **Honest:** describe the code that exists now; call out legacy names instead of pretending they are current.
- **Actionable:** include exact commands, paths, environment variables, and verification steps.
- **Durable:** avoid vendor/model claims that drift quickly unless the code depends on them.
- **Specific:** prefer concrete project paths and behaviours over generic advice.
