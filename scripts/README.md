# Scripts

Local CLIs for the Policai data workflow. They are plain `tsx` entrypoints — no dev server required.

## collect.ts

Runs one collection pass over the watch sources and persists the results (developments feed, watch state, staged reviews, freshness metadata). This is what the daily GitHub Actions workflow runs.

```bash
npm run collect -- --dry-run           # preview without writing
npm run collect -- --source=apra-rss   # single source
npm run collect -- --max-items=3       # cap new items per source
npm run collect                        # full pass, writes data files
```

Optional environment: `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` for AI classification (`AI_MODEL` to override the model). Without a key the collector runs in heuristic mode and labels detections "Needs review".

Discovered links must remain on allow-listed official HTTPS hosts. Redirects
are validated before they are followed, and retryable candidate retrieval
failures stop after five attempts; terminal failures remain in watch state for
auditability without consuming later run capacity.

HTML-source coverage counts recognised result/publication entries, not every
anchor on the page. Collector-created reviews retain their linked development
snapshot so a later run can repair a partial multi-file write.

## audit-sources.ts

Performs a read-only live retrieval audit of every enabled official source and reports reachability, response time, content type, and candidate count.

```bash
npm run audit:sources
npm run audit:sources -- --source=dta-media
npm run audit:sources -- --json
```

By default this audits the automatic catalogue. Add `--include-manual` for a
diagnostic attempt against every source. The command rejects HTTP 200 bot
challenges and exits non-zero when fewer than 80% of selected sources are
usable or a critical source fails.

## audit-register.ts

Compares curated register sources with stored content fingerprints.

```bash
npm run audit:register
npm run audit:register -- --source=<policy-id>
npm run audit:register -- --write-evidence
npm run audit:register -- --strict --json
```

Writing evidence stores missing hashes as stale baselines and marks changed
records `stale`. A first fingerprint cannot prove that the current document is
the version an editor previously reviewed, so missing baselines exit non-zero
and require re-verification. The command never auto-verifies a record.
`--strict` also fails on retrieval unavailability.

## validate-data.ts

Structural validation for the repo data files (enums, ISO dates, unique ids, https government source hosts, cross-references). Runs in `npm run check`, PR CI, and the collector workflow.

```bash
npm run validate:data
```

Exit code 1 on errors; warnings print without failing.

## canonicalize-source-urls.ts

Idempotently migrates legacy or manually edited source-bearing URLs to the
same representation used by extraction, collision checks, collector state,
and persistence.

```bash
npm run canonicalize:urls
```

The command strips fragments and recognised campaign parameters, sorts
meaningful query parameters, removes non-root trailing slashes, and refuses a
watch-state key collision. Routine writes are already canonicalized; this is a
maintenance and migration command.

## Dated migrations and reconciliations

Scripts whose names include a date are retained as an audit trail for material
data corrections. They are idempotent but are not routine operational
entrypoints.

`mark-register-source-audits-2026-07-16.ts` annotates the automated retrievals
from the 16 July register audit as `lastSourceAuditAt`, keeps them distinct from
the earlier editorial `checkedAt`, and marks first-time post-review fingerprints
stale until an editor compares the fingerprinted source version.

## Related Docs

- [`../docs/collector.md`](../docs/collector.md)
- [`../README.md`](../README.md)
