# Scripts

Local CLIs for the Policai data workflow. Both are plain `tsx` entrypoints — no dev server required.

## collect.ts

Runs one collection pass over the watch sources and persists the results (developments feed, watch state, staged reviews, freshness metadata). This is what the daily GitHub Actions workflow runs.

```bash
npm run collect -- --dry-run           # preview without writing
npm run collect -- --source=apra-rss   # single source
npm run collect -- --max-items=3       # cap new items per source
npm run collect                        # full pass, writes data files
```

Optional environment: `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` for AI classification (`AI_MODEL` to override the model). Without a key the collector runs in heuristic mode and labels detections "Needs review".

## validate-data.ts

Structural validation for the repo data files (enums, ISO dates, unique ids, https government source hosts, cross-references). Runs in `npm run check`, PR CI, and the collector workflow.

```bash
npm run validate:data
```

Exit code 1 on errors; warnings print without failing.

## Related Docs

- [`../docs/collector.md`](../docs/collector.md)
- [`../README.md`](../README.md)
