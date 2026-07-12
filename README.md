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

- `public/data/policies.json` — the curated policy register (only changed by reviewed commits)
- `public/data/developments.json` — the automated radar feed
- `public/data/timeline.json`, `agencies.json`, `commonwealth-agencies.json`, `meta.json`
- `data/watch-state.json` — the collector's seen-URL registry
- `data/source-reviews.json` — detections staged for curated review

A daily GitHub Actions workflow ([collect.yml](.github/workflows/collect.yml)) runs the collector over ~27 official sources (departments, regulators, courts, all states and territories — see [src/lib/pipeline/sources.ts](src/lib/pipeline/sources.ts)), classifies new items with AI when a key is configured (keyword heuristics otherwise), validates the data, and commits the results. Vercel redeploys on push, so the site always serves the latest reviewed data as static content — no runtime database.

High-confidence detections are staged in `data/source-reviews.json`; a human (or the local MCP server) reviews and publishes them into the register with a commit. The collector never writes to `policies.json` directly, and CI enforces that.

## Stack

- Next.js 16 App Router, React 19, TypeScript 5 (strict)
- Tailwind CSS 4, shadcn/ui on Radix UI, D3.js
- Cheerio for scraping; Anthropic or OpenRouter for classification (optional)
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
npm run check          # lint + test + validate + build
npm run collect        # run one collection pass (add -- --dry-run to preview)
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
public/data/        canonical data (also served as an open JSON API)
data/               collector state and staged reviews
scripts/            collect.ts and validate-data.ts CLIs
docs/               operational documentation
content/blog/       MDX blog posts
```

## Open data

Everything the site shows is also available as plain JSON, for example:

- `https://policai.com.au/data/policies.json`
- `https://policai.com.au/data/developments.json`
- `https://policai.com.au/data/timeline.json`

## Operations Docs

- [Documentation index](./docs/README.md)
- [Collector operations guide](./docs/collector.md)
- [Scripts overview](./scripts/README.md)
- [Agent instructions](./AGENTS.md)

## Deployment

Vercel serves the site; pushes to `main` deploy automatically. The only production configuration is optional repository secrets for the collector workflow (`ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`) — see [docs/collector.md](./docs/collector.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Data corrections are especially welcome: every record links its official source, and `npm run validate:data` checks structure before CI does.

## License

[AGPL-3.0](LICENSE)
