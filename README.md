# Policai

[![Daily collection](https://github.com/l0cka/policai/actions/workflows/collect.yml/badge.svg)](https://github.com/l0cka/policai/actions/workflows/collect.yml)

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
- `data/developments.json` — the automated radar feed, served through a filtered route
- `public/data/meta.json` — public collection health metadata
- `data/dta-ai-policy-framework.json` — editorial visualization artifact gated by its related policy
- `data/timeline.json`, `agencies.json`, `commonwealth-agencies.json` —
  editorial datasets whose public JSON routes apply verification filters
- `data/watch-state.json` — retryable candidate and source-snapshot state
- `data/source-reviews.json` — detections staged for curated review
- `data/source-monitoring.json` — the manual-source review ledger

A daily GitHub Actions workflow ([collect.yml](.github/workflows/collect.yml)) runs the collector over the official sources that reliably permit machine retrieval. Sources protected by browser challenges are kept in the same source catalogue but reviewed through the manual coverage ledger. New items are classified by deterministic keyword rules with capped confidence, validated, and committed. Vercel redeploys on push, so the site serves static, versioned content — no runtime database.

High-confidence detections are staged in `data/source-reviews.json`; a reviewer uses the local stage → approve → publish workflow before they enter the register. Public register and timeline reads only expose verified records. The collector never writes to `policies.json` directly, and CI enforces that.

## Stack

- Next.js 16 App Router, React 19, TypeScript 5 (strict)
- Tailwind CSS 4, shadcn/ui on Radix UI, D3.js
- Cheerio for scraping and deterministic relevance classification
- Vitest; GitHub Actions for automation; Vercel for hosting

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
npm run mcp            # run the local MCP source-ingest server
```

## Repository Layout

```text
src/app/            App Router pages and read-only API routes
src/components/     UI, layout, network, and visualisation components
src/lib/            data service, validation, analysis helpers
src/lib/pipeline/   collector: sources, extract, classify, orchestrate
src/mcp/            local MCP source-ingest server (curated publishing)
src/types/          shared domain types
public/data/        public-safe canonical data served directly as open JSON
data/               editorial register/data, collector state, reviews, coverage
scripts/            collector, source audits, validation and migrations
docs/               operational documentation
content/blog/       MDX blog posts
```

## Open data

Everything the site shows is also available as plain JSON, for example:

- `https://policai.com.au/data/policies.json`
- `https://policai.com.au/data/developments.json`
- `https://policai.com.au/data/timeline.json`

Policy, agency, and timeline JSON is served through read-only route handlers so
unverified, stale, or withheld editorial records cannot bypass the same public
filters as the site.

## Operations Docs

- [Documentation index](./docs/README.md)
- [Collector operations guide](./docs/collector.md)
- [Information trust model](./docs/trust-model.md)
- [Architecture](./docs/architecture.md)
- [Scripts overview](./scripts/README.md)
- [Agent instructions](./AGENTS.md)

## Deployment

Vercel serves the site; pushes to `main` deploy automatically. The collector does not require an external analysis service or model credential. See [docs/collector.md](./docs/collector.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Data corrections are especially welcome: every record links its official source, and `npm run validate:data` checks structure before CI does.

## License

[AGPL-3.0](LICENSE)
