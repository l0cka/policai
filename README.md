# Policai

Policai is an Australian AI policy tracker built with Next.js. It aggregates, analyses, and visualises AI policy, regulation, and governance developments across Australian federal and state or territory jurisdictions.

Current product surface:
- searchable policy browser with timeline view
- agencies directory
- interactive Australia map
- DTA framework visualisation
- admin workflow for scraping, review, and pipeline operations

## Stack

- Next.js 16 App Router
- React 19
- TypeScript 5 in strict mode
- Tailwind CSS 4
- shadcn/ui on Radix UI
- D3.js and React Flow
- Supabase with JSON-file fallback in `public/data/`
- OpenRouter (Perplexity + auto model routing) for policy discovery and analysis

## Quick Start

### Prerequisites

- Node.js `>=20.19.0`
- npm

### Install and Run

```bash
npm install
# create .env.local manually
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Copy the example file and fill in your keys:

```bash
cp .env.example .env.local
```

The app works without any keys by falling back to JSON files in `public/data/`. See `.env.example` for all available variables.

## Commands

```bash
npm run dev         # local dev server
npm run build       # production build
npm run start       # run the production server
npm run lint        # ESLint
npm run test        # Vitest
npm run scrape      # run scheduled scraper sources
npm run pipeline    # run the daily research/verifier pipeline
```

## Repository Layout

```text
src/app/            App Router pages and API routes
src/components/     UI, layout, admin, and visualisation components
src/lib/            data services, AI clients, helpers, and agent modules
src/types/          shared domain types
public/data/        JSON fallback data
scripts/            local automation entrypoints
docs/               operational and project documentation
```

## Data Model

Policai uses a dual-storage approach:
- Supabase when environment variables are configured
- JSON files in `public/data/` as the local fallback

This keeps local development simple while allowing production deployments to use a real database.

## Operations Docs

- [Documentation index](./docs/README.md)
- [Scraper operations guide](./docs/scraper.md)
- [Scripts overview](./scripts/README.md)
- [Agent instructions](./AGENTS.md)

## Deployment

Vercel is the default target. Set the required environment variables in the Vercel project, then deploy normally with the platform or CLI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

[AGPL-3.0](LICENSE)
