# Scripts

Local CLIs for the Policai data workflow. They are plain `tsx` entrypoints — no dev server required.

## Flags

`src/lib/cli-args.ts` parses the flags of `audit-sources.ts`,
`audit-register.ts`, `check-freshness.ts`, `discover-sources.ts`,
`report-watch-coverage.ts`, `reconfirm-register.ts` and
`source-review-batch.ts`. Each script declares one flag table; the parser and
the `--help` text both come from it, so the usage cannot drift from what the
script accepts. `src/lib/cli-scripts.test.ts` runs every one of them with
`--help`, with an unknown flag and with all of its documented flags.

- `--help` prints the usage and exits 0. On a script with subcommands,
  `--help` alone prints every subcommand and `<subcommand> --help` prints one.
- An unknown flag, a positional argument, a flag with no value or an empty one
  (`--source=`), a value flag given twice, a missing required flag, or an
  unknown subcommand prints the reason and the usage on stderr and exits 2
  before the script reads data, takes the data lock or opens a connection. A
  typo such as `--write-evidnce` or `--dryrun` therefore never runs the
  default action.
- `--flag=value` and `--flag value` are both accepted.
- A subcommand accepts only its own flags: `approve --dry-run` is an error,
  not an approval.

`collect.ts` has its own strict parser (see below); unlike the shared one it
accepts a repeated flag and uses the last value. The other scripts are not on
the shared parser.

## collect.ts

Runs one collection pass over the watch sources and persists the results (developments feed, watch state, staged reviews, freshness metadata). The host wrapper `ops/collector/policai-collect.sh` runs it daily and fails the run if `data/policies.json` changed. The write step lives in `collect-run.ts`; `src/lib/pipeline/collect-run.test.ts` runs it against a temporary data directory and asserts the register stays byte-identical. Review candidates merge by stable id, because a retried run can carry newer evidence for a pending review. Reviews and developments are written before the watch state, so a failed write is recreated with the same ids on the next run.

```bash
npm run collect -- --dry-run           # preview without writing
npm run collect -- --source=apra-rss   # single source
npm run collect -- --max-items=3       # cap new items per source
npm run collect                        # full pass, writes data files
npm run collect -- --help              # print the flags
```

The flags are parsed strictly. An unknown flag (`--dryrun`), a positional
argument, a flag with no value, an empty `--source=` or a `--max-items` that is
not a positive integer prints the usage and exits 2 before the run starts, so a
typo never becomes a full writing pass. `--source=track:<policyId>` targets one
followed record and skips the catalogue sources.

`POLICAI_COLLECTOR_STATE` names the host folder holding the collector's watch
state and outbox (`collect-run.ts`); the host wrapper sets it.

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
npm run audit:sources -- --include-manual
npm run audit:sources -- --json
npm run audit:sources -- --help
```

By default this audits the automatic catalogue. Add `--include-manual` for a
diagnostic attempt against every source. The command rejects HTTP 200 bot
challenges and exits non-zero when fewer than 80% of selected sources are
usable or a critical source fails.

The audit retrieves as the collector does: under the declared Policai
identity, unless the source carries a time-boxed identity exception that is
still live. A result for a source with such an exception reports its state in
`identityException` and `identityNote`.

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
npm run audit:register -- --help
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

## check-signed-records.ts

Runs only the passkey gate (`validateEditorApprovals` and
`validateSignedRecordChanges`) on a head revision merged into a base revision,
reading the data files from Git objects and never from the working tree. The
`signed-records` workflow runs it from `main`'s code against each pull request
(docs/collector.md, "Reviewing detections into the register").

```bash
npx tsx scripts/check-signed-records.ts origin/main HEAD
```

Exit code 1 on any error, a merge conflict, a Git failure, invalid JSON, a
data path that is not a regular file (mode `100644`) in the merged tree, or a
data file the base has and the merged tree lacks.

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

## check-freshness.ts

Freshness ratchet for public records: register policies, timeline events and
developments. A public record is overdue when its last editorial verification
is older than `EDITORIAL_REVIEW_INTERVAL_DAYS`. Overdue records stay published
and are labelled "Review due". The check exits 1 when the overdue count of any
kind exceeds that kind's budget in `data/freshness-budget.json`, and 2 when
that file or `--now` is invalid.

```bash
npm run check:freshness
npm run check:freshness -- --now=2027-01-20   # rehearse a future date
npm run check:freshness -- --json
npm run check:freshness -- --help
```

Each budget is a ratchet: lower it whenever the backlog shrinks. Raising it
needs a reason in the pull request that changes the file; the check prints the
current counts so the new value is not guessed.

Only editor-verified developments are counted. An unverified detection shows
"Needs review", not "Review due", and the feed's timeline projections age with
their timeline event.

## reconfirm-register.ts

Re-confirms editorially verified records whose official source is unchanged
since an editor last verified them, with one editor approval per batch.
Register policies, timeline events and developments each have their own
batches. The procedure is in `docs/collector.md`, "Re-confirming due records
on Argus".

```bash
npm run reconfirm:register -- propose [--kind=policy|timeline|development] \
    [--due-within=30] [--batch-size=10] [--exclude=<id>,<id>] [--dry-run]
npm run reconfirm:register -- approve --batch=<id>
npm run reconfirm:register -- --help
```

`propose` audits every record of the kind (default `policy`) due within the
window. It needs network access to the official sources, so run it on Argus.
It writes the audit evidence to that kind's data file, keeping every other
field of each record, and appends batches of unchanged records to
`data/reconfirmations.json`. Changed or unreadable sources are listed for a
full review instead. `--exclude` leaves out records another piece of work is
already re-verifying. `--dry-run` audits and prints the batches and writes
nothing.

Two groups of records are never batched. The policy named by
`relatedPolicyId` in `data/dta-ai-policy-framework.json` is re-verified
together with the framework artifact, because the artifact must not predate
its policy's verification. A dismissed development is not public, so it has
nothing to renew.

`approve` needs no network beyond the approvals mailbox. It reads the kind
from the batch and renews its records only if every fingerprint still matches
and every audit is at most seven days old. Once an editor passkey is
registered it takes the editor's passkey signature over the batch from the
mailbox; `propose` prints the page where the editor signs. Before then it
takes `--attestation=<card url> [--approved-at=<ISO>] [--approved-by=<name>]`.

## source-review-batch.ts

Approves several staged source reviews on one editor passkey signature.

```bash
npm run source-review:batch -- propose --ids=<id,id,...> [--batch-size=10]
npm run source-review:batch -- approve --batch=<id>
npm run source-review:batch -- --help
```

`propose` pins each review to its current proposal (every one must have no
blockers), writes the batches to `data/source-review-batches.json` and prints
each batch's approve link with what the editor must see. `approve` reads the
editor's signature from the approvals mailbox and publishes every review in
the batch; rerunning it resumes a partial run.

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

`discover-sources.ts` and `report-watch-coverage.ts` take `--help` (see
Flags). For the other scripts here, the header comment lists the flags.

- `bundle-data.mjs` writes `data/` and `public/data/` into
  `.open-next/assets/_bundled/files.json` for the Cloudflare Workers build.
  Only `npm run build:cloudflare` runs it.
- `sync-design-tokens.mjs` copies `design/tokens.css` into both apps. Add
  `--check` to fail on drift instead of writing.
- `collector-proposals.ts` (`npm run collector:proposals`) lists automatic
  sources that failed three runs in a row as proposals to move them to manual.
  It moves nothing.
- `discover-sources.ts` (`npm run discover:sources -- --body=<id>`) proposes
  watch sources for one body in `data/bodies.json`, from its robots.txt
  sitemaps, `/sitemap.xml` and the feeds its home page links. Every request
  goes through the host gate under the declared identity and the
  official-host allow-list. It writes nothing: admit a proposal through a
  reviewed PR that adds it to `src/lib/pipeline/sources.ts`. Add `--json` for
  JSON.
- `report-watch-coverage.ts` (`npm run report:watch-coverage`) reports which
  bodies the collector watches, by jurisdiction and tier, with every gap and
  decided block. Add `--json` for JSON.
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

`codemod-label-tokens.mjs` rewrites the hand-written mono label recipe in
`src/**/*.tsx` class strings to the `.label` and `.label-caps` classes from
`src/app/globals.css`. It works on one string literal at a time, so a recipe
split across several strings is not rewritten.

| Class string contains | Becomes | Rendered change |
| --- | --- | --- |
| `font-mono`, an 11px size, `uppercase` and 0.08em tracking | `label` | none |
| the same with 0.12em tracking | `label-caps` | none |
| the same with 0.1em tracking | `label-caps` | tracking 1.1px to 1.32px |
| the same with 0.14em tracking | `label-caps` | tracking 1.54px to 1.32px |
| any other raw 11px size | the size as `var(--type-label)` | none at a 16px root |

An 11px size is the raw pixel utility or the `--type-label` utility. Every
other class in the string is kept. 0.1em maps to `label-caps` because five of
its six uses were table headers, which A2J sets at 0.12em. Labels at 10px, and
`text-xs` labels with `tracking-wider`, are not label recipes and stay as
written. `--type-label` is 0.6875rem, so a rewritten label follows the
reader's root font size where the pixel value did not.

`--check` writes nothing and exits 1 when a class string would change. Both
modes exit 1 when a raw 11px size is left outside a class string.
`--manifest=<file>` writes every edit (file, line, category, before, after) as
JSON. A second run changes nothing. The script builds the class names it
searches for from parts, because Tailwind scans `scripts/` and would otherwise
emit the utilities the codemod removes.

```bash
node scripts/codemod-label-tokens.mjs
node scripts/codemod-label-tokens.mjs --check
```

## Related Docs

- [`../docs/collector.md`](../docs/collector.md)
- [`../README.md`](../README.md)
