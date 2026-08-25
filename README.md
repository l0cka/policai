<p align="center">
  <a href="https://policai.org">
    <img src="./docs/design/policai-readme-banner.png" alt="Policai — Australian AI policy tracker" width="100%" />
  </a>
</p>

# Policai

[![Website](https://img.shields.io/badge/website-policai.org-146B5A?style=flat-square)](https://policai.org)
[![Pull Request Checks](https://github.com/l0cka/policai/actions/workflows/pull-request-checks.yml/badge.svg)](https://github.com/l0cka/policai/actions/workflows/pull-request-checks.yml)
[![License: AGPL-3.0](https://img.shields.io/github/license/l0cka/policai?style=flat-square)](./LICENSE)
[![Node.js >= 20.19.0](https://img.shields.io/badge/Node.js-%E2%89%A520.19.0-2F4FD8?style=flat-square&logo=nodedotjs&logoColor=white)](./package.json)

Policai is an Australian AI policy tracker. It maintains a curated register of AI policy, regulation, governance and court guidance across federal and state/territory jurisdictions, and automatically detects new developments from official government sources every day.

Product surface:

- searchable policy register with status lifecycle (active, superseded, closed, …)
- developments feed of newly detected policy activity, with provenance and confidence labels
- court AI guidance view
- agencies directory
- interactive Australia map
- timeline, network, and DTA framework visualisations
- MDX-backed blog

## How it stays current

**Git is the database.** The canonical data lives in this repository:

- `data/policies.json` — the curated policy register (only changed by reviewed commits; served through a filtered route)
- `data/developments.json` — the automated radar feed, combined at read time
  with verified legacy announcements from the editorial chronology
- `public/data/meta.json` — public collection health metadata
- `data/dta-ai-policy-framework.json` — editorial visualization artifact gated by its related policy
- `data/timeline.json`, `agencies.json`, `commonwealth-agencies.json` —
  editorial datasets whose public JSON routes apply verification filters
- `data/watch-state.json` — retryable candidate and source-snapshot state
- `data/source-reviews.json` — detections staged for curated review
- `data/source-monitoring.json` — the manual-source review ledger

The maintainer's server runs the collector daily, from its own checkout, over the official sources that reliably permit machine retrieval. Sources protected by browser challenges are kept in the same source catalogue but reviewed through the manual coverage ledger. Candidate pages from browser-only sources are retrieved through a self-hosted Firecrawl instance, falling back to headless Chromium when Firecrawl is unavailable. New items are classified by keyword heuristic by default, or by Claude, an Anthropic model, in batches when the collector's Claude classifier is enabled (it is enabled in production). Either classifier path caps stored confidence at 0.65, so an automated discovery never reads as more certain than an editor's review. Change detections on already-tracked records are different: they store a relevance score of 1 because the score there records certainty that a known instrument's page changed, not classifier confidence — those detections are still editor-gated before anything publishes. Detections are validated and committed. The site reads that data from disk and revalidates hourly; there is no runtime database.

High-confidence detections are staged in `data/source-reviews.json`; a reviewer uses the local stage → approve → publish workflow before they enter the register. The public policy timeline exposes only verified lifecycle events linked to visible register records. Verified announcements and milestones belong in Developments; legacy examples still stored in `data/timeline.json` are projected there without duplicating their evidence. The collector never writes to `policies.json` directly, and CI enforces that.

## Stack

- Next.js 16 App Router, React 19, TypeScript 5 (strict)
- Tailwind CSS 4, shadcn/ui on Radix UI, D3.js
- Cheerio for scraping; keyword heuristic or Claude (Anthropic) for relevance classification
- Vitest; daily scheduled collection on the maintainer's server (GitHub Actions kept as a manual fallback); self-hosted behind a Cloudflare tunnel

## Quick Start

Prerequisites: Node.js `>=20.19.0`, npm.

```bash
npm install
cp .env.example .env.local   # optional — the site runs with no keys at all
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run dev            # local dev server
npm run build          # production build
npm run start          # run the production server
npm run lint           # ESLint
npm run test           # Vitest
npm run validate:data  # structural validation of the repo data files
npm run canonicalize:urls # normalize legacy/manual source URL variants
npm run check          # lint + strict typecheck + test + validate + build
npm run collect        # run one collection pass (add -- --dry-run to preview)
npm run audit:sources  # live health check of automatic discovery sources
npm run audit:register # compare curated source fingerprints
npm run mcp            # run the local editorial MCP server
npm run mcp:public     # run the read-only public MCP server
```

## Repository Layout

```text
src/app/            App Router pages and read-only API routes
src/components/     UI, layout, network, and visualisation components
src/lib/            data service, validation, analysis helpers
src/lib/pipeline/   collector: sources, extract, classify, orchestrate
src/mcp/            local editorial and public read-only MCP servers
src/types/          shared domain types
public/data/        public-safe canonical data served directly as open JSON
data/               editorial register/data, collector state, reviews, coverage
scripts/            collector, source audits, validation and migrations
docs/               operational documentation
content/blog/       MDX blog posts
```

## Open data

Everything the site shows is also available as plain JSON, for example:

- `https://policai.org/data/policies.json`
- `https://policai.org/data/developments.json`
- `https://policai.org/data/timeline.json`

Read-only route handlers serve policy, agency, and timeline JSON. They apply the
same public verification filters as the site.

The [public API and MCP guide](./docs/api.md) lists the supported endpoints,
filters, response formats, and MCP tools.

## Operations Docs

- [Documentation index](./docs/README.md)
- [Public API and MCP](./docs/api.md)
- [Collector operations guide](./docs/collector.md)
- [Information trust model](./docs/trust-model.md)
- [Architecture](./docs/architecture.md)
- [Scripts overview](./scripts/README.md)
- [Agent instructions](./AGENTS.md)

## Deployment

The site is self-hosted at [policai.org](https://policai.org), served by `next start` behind a Cloudflare tunnel. The host pulls `main` on a timer: data-only commits are picked up by ISR within the hour, and code changes trigger a rebuild and restart. See [docs/hosting-argus.md](./docs/hosting-argus.md). The collector runs on the same host, in a separate checkout on a daily schedule, and pushes its commits to the same repository. It retrieves browser-only candidate pages through a self-hosted Firecrawl instance and, in production, classifies candidates with Claude through the Claude Code CLI already installed on the host. See [docs/collector.md](./docs/collector.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Data corrections are especially welcome: every record links its official source, and `npm run validate:data` checks structure before CI does.

## License

[AGPL-3.0](LICENSE)
