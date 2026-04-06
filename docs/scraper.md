# Scraper Operations

This guide covers the automated policy scraper and the daily review pipeline.

## What the Scraper Does

The scraper visits configured Australian government sources, extracts likely policy links, analyses the content with Anthropic, and then:

- auto-creates policies when relevance is `>= 0.8`
- sends medium-confidence items to `public/data/pending-content.json`
- skips low-confidence content

The local runner is [`scripts/run-scheduled-scrapers.ts`](../scripts/run-scheduled-scrapers.ts). The server-side implementation is in [`src/app/api/admin/run-scraper/route.ts`](../src/app/api/admin/run-scraper/route.ts) and the cron-safe fan-out endpoint is in [`src/app/api/cron/scrape/route.ts`](../src/app/api/cron/scrape/route.ts).

## Sources

Current scheduled sources:

1. DTA AI Policy
2. DISER AI Strategy
3. CSIRO Data61
4. AHRC AI Ethics
5. OAIC AI Guidance
6. NSW Digital AI
7. Victorian AI Strategy
8. ACCC Digital Platforms

## Local Setup

Required:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Optional but useful when scripts need to call a non-default app URL:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

If `NEXT_PUBLIC_API_URL` is not set, the local scripts assume `http://localhost:3000`.

## Local Usage

Start the app:

```bash
npm run dev
```

Run the scraper scheduler:

```bash
npm run scrape
```

Run the daily research and verification pipeline:

```bash
npm run pipeline
```

Admin review UI:

- `http://localhost:3000/admin`

## Important Files

- `public/data/sample-policies.json` — JSON fallback policy store
- `public/data/pending-content.json` — queued items awaiting review
- `data/scraper-state.json` — local scheduler state

## Production Automation

### Vercel Cron

The app already includes cron-safe endpoints:

- `/api/cron/scrape`
- `/api/cron/pipeline`

They require `CRON_SECRET` and are intended to be triggered by Vercel Cron Jobs.

### GitHub Actions

A starter workflow is available at [`/.github/workflows/scraper.yml.example`](../.github/workflows/scraper.yml.example). If you use it:

- rename it to `scraper.yml`
- add `ANTHROPIC_API_KEY` to repository secrets
- add `NEXT_PUBLIC_API_URL` only if the workflow must target a non-default app URL

## Troubleshooting

### `ANTHROPIC_API_KEY` not configured

Add the key to `.env.local` locally or to your deployment environment.

### The scraper hits the wrong local port

Set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Nothing new is being created

Check:

1. `public/data/pending-content.json` for medium-confidence items
2. `data/scraper-state.json` for last-run timestamps and failures
3. the admin dashboard review and source tabs

### A source changed structure

The link-discovery heuristics and scraping logic live in:

- [`src/app/api/admin/run-scraper/route.ts`](../src/app/api/admin/run-scraper/route.ts)
- [`src/app/api/cron/scrape/route.ts`](../src/app/api/cron/scrape/route.ts)
- [`src/lib/data-sources.ts`](../src/lib/data-sources.ts)
