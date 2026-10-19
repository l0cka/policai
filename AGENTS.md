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
- **Retrieval:** plain HTTP first; self-hosted Firecrawl for candidate pages on browser-strategy sources, falling back to headless Chromium (Playwright); index and RSS listing pages always use headless Chromium directly. Every path sends the collector identity `Policai/1.0 (+https://policai.org)` (`src/lib/pipeline/identity.ts`; see Collector identity below) and passes through one `HostGate` (`src/lib/pipeline/host-gate.ts`: robots.txt, a 2 s gap per host, `Retry-After`, a per-run breaker; docs/collector.md "Politeness"). Firecrawl `map` and `crawl` are not used.
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
│   ├── validate-data.ts          # Data schema enforcement (used by CI + collector)
│   ├── articles.ts               # Article frontmatter parser, standard notice text, citation state
│   ├── article-figures.ts        # Figure blocks in article bodies, register chart counts
│   ├── article-baseline.ts       # Reads the base revision of data/articles/ from Git
│   ├── analysis.ts               # Deterministic relevance/summary helpers
│   ├── related-policies.ts       # Ranked related instruments for /policies/[id] (see Related instruments)
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
2. **Developments** (`data/developments.json`): automated radar feed. Each entry has provenance (`sourceId`, `url`), a relevance score, and a `classification` label — `heuristic` (deterministic keyword rules, the default) or `ai` (Claude classification, active when `USE_CLAUDE_CLASSIFIER` is set), plus `curated` for promoted register entries. Both classifier paths cap confidence at 0.65 (`MACHINE_CONFIDENCE_CAP`) and show as "Needs review". Direct-document change detections on tracked records carry `relevanceScore: 1` — the score records change-certainty for a known instrument, not classifier confidence — and are equally editor-gated. `/data/developments.json` filters dismissed entries. Public feed entries render `id={development.id}` so `/developments#<id>` reveals past the other tab and filters (#223); dismissed rows never reach the browser. `docs/editorial-policy.md` allows those fragment links.
3. **Editorial directories** (`data/timeline.json`, `data/agencies.json`,
   `data/commonwealth-agencies.json`): may contain records awaiting review and
   are never served statically; `/data/*.json` route handlers apply public
   verification filters.
   The DTA framework artifact is also editorial and is withheld whenever its
   related register policy is withheld.
4. **Collector** (`src/lib/pipeline/collect.ts`): pure orchestrator — fetch sources → extract candidates → diff against `data/watch-state.json` → classify → return developments/review candidates/state/meta. The CLI (`scripts/collect.ts`) persists them. Every fresh-vs-stored fingerprint comparison uses `matchesRetrievedContent` (pending document candidates, ordered re-staging, re-approval `reviewedDate`, adoption-path snapshot gate, and register audit `--write-evidence`; #249; `docs/collector.md`).
5. **Review**: high-confidence detections are staged in `data/source-reviews.json`; a separate approval action is required before publishing creates a register record. Changed direct-document sources stage a version-specific review with `targetPolicyId`, temporarily withhold the existing policy publicly, and update that policy in place after approval.
6. **Coverage**: automatic sources report usable-content health in `public/data/meta.json`; protected sources are tracked in `data/source-monitoring.json`.
7. **Freshness**: register source fingerprints are checked with `npm run audit:register`; changed content marks a record stale until editorial re-verification. Separately, a record whose manual verification is older than 90 days stays public but is shown as "Review due"; `npm run check:freshness` (CI, weekly) fails when overdue records exceed the ratchet in `data/freshness-budget.json`.

8. **Articles** (`data/articles/<slug>.md`): Policai's written analysis. See Articles below.

See [docs/collector.md](./docs/collector.md) for operations.
