# Scripts

Local CLIs for the Policai data workflow. They are plain `tsx` entrypoints — no dev server required.

## collect.ts

Runs one collection pass over the watch sources and persists the results (developments feed, watch state, staged reviews, freshness metadata). The host wrapper `ops/collector/policai-collect.sh` runs it daily and fails the run if `data/policies.json` changed. The write step lives in `collect-run.ts`; `src/lib/pipeline/collect-run.test.ts` runs it against a temporary data directory and asserts the register stays byte-identical. Review candidates merge by stable id, because a retried run can carry newer evidence for a pending review. Reviews and developments are written before the watch state, so a failed write is recreated with the same ids on the next run.

```bash
npm run collect -- --dry-run           # preview without writing
npm run collect -- --source=apra-rss   # single source
npm run collect -- --max-items=3       # cap new items per source
npm run collect                        # full pass, writes data files
```

Classification uses keyword rules, or the local Clef model when
`USE_CLEF_CLASSIFIER=1` (see `docs/collector.md`, Classification). Confidence is
capped so collector detections are always labelled "Needs review".

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

## e24-report.ts

Lists what the last collection run did with the 16 E24 sources (#162), offline.
It reads `public/data/meta.json` `collector.sourceResults` and, optionally, the
run log, and prints one line per source: critical flag, outcome, refusal kind,
`identityException` marker and the first line of the error. A second section
lists other sources whose failure matches a refusal pattern (`wa-ai-policy`
reaches `www.finance.gov.au` through a linked PDF).

```bash
npm run report:e24
npm run report:e24 -- --log=<run evidence dir>/collect.log
npm run report:e24 -- --meta=<path> --json
```

Outcomes: `refused`, `failed`, `success`, `not-due` (a weekly source that was
skipped), `manual` (now tracked by hand) and `not-run` (absent from the run).
A failure is `refused` when its error, or a candidate failure for that source in
the log, contains `ERR_HTTP2_PROTOCOL_ERROR`, `ERR_CONNECTION_RESET`/`ECONNRESET`
or `HTTP 403`. The label is a pattern match for editorial review, not proof that
the host refused the identity. Candidate failures appear in `meta.json` only as
a count, so pass the log to see their errors. The source list is pinned in
`src/lib/pipeline/e24-report.ts`, independent of the `identityException` field.

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
Browser-capture and server-retrieval composites are compared only when they
share compatible linked-document evidence; otherwise the result is reported as
`comparison_unavailable` without a false change alert. `--strict` also fails on
retrieval unavailability.

Retrieval gives each source a generous per-attempt timeout (45s by default) and
exactly one retry for transient failures — timeouts, DNS/socket errors, and
HTTP 408/429/5xx — after a short backoff. Client errors such as HTTP 403 bot
walls are never retried. A retried-then-failed source still reports
`retrieval_failed`; no failures are silently swallowed. The raised timeout
trades roughly double the worst-case wall clock per slow source (2 x 45s) for
confirming sources that merely answer slowly: the 2026-09-24 sweep showed most
of the 42 retrieval failures were 20s timeouts against slow government hosts,
not content changes.

Environment overrides (per run):

```bash
AUDIT_REGISTER_TIMEOUT_MS=45000      # per-attempt timeout in ms
AUDIT_REGISTER_ATTEMPTS=2            # 2 = exactly one retry
AUDIT_REGISTER_RETRY_DELAY_MS=1000   # backoff before the retry in ms
npm run audit:register
```

## validate-data.ts

Structural validation for the repo data files (enums, ISO dates, unique ids, https government source hosts, cross-references). Runs in `npm run check`, PR CI, and the collector workflow.

```bash
npm run validate:data
```

Exit code 1 on errors; warnings print without failing.

Secondary (non-primary) structured dates on verified records are gated as a
lower-only budget ratchet rather than hard errors, mirroring
`scripts/check-freshness.ts`: the count of secondary dates without matching
source publication metadata or `reviewedDate` evidence must not exceed
`maxUnevidencedSecondaryDates` in `data/record-evidence-budget.json`. Lower the
budget whenever the backlog shrinks; raising it needs a stated reason in the
pull request that changes the file, and an unargued raise fails validation in
CI (the script compares against the merge base when `GITHUB_BASE_SHA` is set).
Unevidenced dates are listed in the output so the new value is never guessed.
The ratchet keeps historical records valid while any growth in unevidenced
secondary dates fails validation.

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

## Smaller CLIs

Each script's header comment lists its flags.

- `bundle-data.mjs` writes `data/` and `public/data/` into
  `src/lib/bundled-files.generated.ts` for the Cloudflare Workers build.
  `npm run build` and `npm test` run it first.
- `sync-design-tokens.mjs` copies `design/tokens.css` into both apps. Add
  `--check` to fail on drift instead of writing.
- `collector-proposals.ts` (`npm run collector:proposals`) lists automatic
  sources that failed three runs in a row as proposals to move them to manual.
  It moves nothing.
- `discover-sources.ts` (`npm run discover:sources -- --body=<id>`) proposes
  watch sources for one body in `data/bodies.json`. It writes nothing.
- `report-watch-coverage.ts` (`npm run report:watch-coverage`) reports which
  bodies the collector watches, by jurisdiction and tier, with every gap.
- `survey-site-reuse.ts` (`npm run survey:site-reuse -- --out=<file>`) finds
  each host's copyright or licence statements as evidence for
  `data/site-reuse.json`. It never writes that file.
- `signal-source-reviews.ts` (`npm run signal:reviews`) prints cards for
  pending source reviews. Its `apply` mode is the laptop recovery path when
  the Signal HTTPS API is down (`docs/collector.md`, Policai Signal).
- `add-article-image.ts` (`npm run add:article-image -- <image-url> <slug>`)
  downloads and optimises a lead image for an article and prints the
  frontmatter stub to fill in.
- `compare-classifier.ts` scores `data/developments.json` with the local Clef
  model and compares its verdicts with editors' decisions. Run it on Argus.

## Dated migrations and reconciliations

Scripts whose names include a date are retained as an audit trail for material
data corrections. They are idempotent but are not routine operational
entrypoints.

`mark-register-source-audits-2026-07-16.ts` annotates the automated retrievals
from the 16 July register audit as `lastSourceAuditAt`, keeps them distinct from
the earlier editorial `checkedAt`, and marks first-time post-review fingerprints
stale until an editor compares the fingerprinted source version.

`apply-themes-2026-10-17.ts` sets `themes` on every register record from
`policy-themes-2026-10-17.json`, the per-record table approved in issue #305
(theme labels, transcribed from the issue). It inserts `themes` after `tags`
and changes nothing else. It fails when a record has no row, a row has no
record, or a label is not in `src/lib/themes.ts`. A second run leaves the file
byte-identical. After merging `main` into the branch that carries it, rerun it
rather than resolving `data/policies.json` by hand.

```bash
npx tsx scripts/apply-themes-2026-10-17.ts
```

## Related Docs

- [`../docs/collector.md`](../docs/collector.md)
- [`../README.md`](../README.md)
