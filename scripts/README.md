# Scripts

This directory contains local automation entrypoints for the Policai operations workflow.

## Included Scripts

- `run-scheduled-scrapers.ts` — runs scraper sources that are due based on local schedule state.
- `run-daily-pipeline.ts` — runs the research and verification pipeline and stops if a human review is already pending.

## Usage

```bash
npm run scrape
npm run pipeline
```

Both scripts expect `ANTHROPIC_API_KEY` to be configured. They call the app over HTTP and default to `http://localhost:3000` unless `NEXT_PUBLIC_API_URL` is set.

## Related Docs

- [`../docs/scraper.md`](../docs/scraper.md)
- [`../README.md`](../README.md)

### Test a Single Source

Modify the script to run only one source:

```typescript
const DATA_SOURCES = [
  {
    id: 'source-1',
    name: 'DTA AI Policy',
    schedule: 'daily',
    enabled: true,
  },
];
```

### Adjust Confidence Thresholds

Edit `/src/app/api/admin/run-scraper/route.ts`:

```typescript
if (analysis.relevanceScore >= 0.9 && analysis.isRelevant) {
  // Higher threshold for auto-creation
  await createPolicy(/*...*/);
}
```

## Performance

- Each scraper processes up to 10 links per source
- Rate limiting: 2 seconds between pages, 5 seconds between sources
- Typical run time: 3-5 minutes per source
- Claude API cost: ~$0.05-0.10 per scraper run

## Contributing

To add support for more data sources:

1. Add the source to `DATA_SOURCES` in `run-scraper/route.ts`
2. Update the schedule in `run-scheduled-scrapers.ts`
3. Test with manual execution first
4. Monitor the admin dashboard for quality
