# Moving the collector to Argus

Design for Phase 2: retire the GitHub Actions collection workflow and run
collection on the Argus server, retrieving through self-hosted Firecrawl and
using Claude for the judgment that keyword heuristics do badly.

Phase 1, hosting the site on Argus, is complete and described in
[hosting-argus.md](./hosting-argus.md).

Date: 2026-08-07

## Goal

Collection runs on Argus, on a schedule, with better retrieval and better
relevance judgment than the current workflow, and without a model ever being
able to write a register record.

## Current state

Observed 2026-08-06:

- `.github/workflows/collect.yml` runs daily at 19:30 UTC on a GitHub-hosted
  runner. It installs headless Chromium, runs the collector, validates the data,
  guards `data/policies.json`, commits, and pushes to `main` using a deploy key
  that is a bypass actor on the "Protect main" ruleset.
- The pipeline is about 6,600 lines under `src/lib/pipeline/` with about 3,300
  lines of tests. Sources declare `automation: 'automatic' | 'manual'` and
  `fetchStrategy: 'http' | 'browser'`.
- Latest collection health is `degraded`: 31 of 33 due sources reached.
- `data/source-reviews.json` holds 97 entries in `pending_review`.
- Firecrawl is already self-hosted on Argus. `firecrawl-proxy.socket` listens on
  `127.0.0.1:3003` and wakes a compose stack on first connection;
  `firecrawl-idle-stop.timer` releases it when idle. A cold scrape of
  `oaic.gov.au` took 17.5 seconds and returned 12,578 characters of markdown.
- Claude Code 2.1.221 is installed with credentials at
  `~/.claude/.credentials.json`.
- The "Protect main" ruleset lists admin as a bypass actor, and Argus's SSH key
  acts as the repository owner, so it can push to `main` without the deploy key.

## Two failures this addresses

The design targets the failures that exist, not hypothetical ones.

**Retrieval.** Two of 33 due sources fail, and one source is marked `manual`
because its publisher blocks automation. Firecrawl handles JavaScript rendering
and blocking better than the current Playwright fallback, and returns markdown
rather than HTML that then needs parsing.

**Judgment.** 97 detections sit in `pending_review`. Keyword heuristics decide
relevance with capped confidence, which produces a queue an editor must work
through. Better relevance judgment and a usable draft summary shorten that queue.

## Architecture

```
policai-collect.timer   19:30 UTC daily
        |
        v
~/live/policai-collector          SEPARATE checkout
        |
        |-- retrieval:   Firecrawl on 127.0.0.1:3003, HTTP fallback
        |-- judgment:    Claude, per new candidate only
        |-- guards:      validate:data, policies.json unchanged
        |
        v  git push
GitHub main
        |
        v  policai-pull.timer, every 15 min
~/live/policai                    serving checkout, unchanged
```

### The collector gets its own checkout

This is the one structural decision that is not obvious. The collector must not
run in `~/live/policai`. That checkout is served by `policai.service`, and
`policai-deploy.sh` refuses to pull when local `HEAD` is not an ancestor of
`origin/main`. A collector committing there would trip that guard every run, by
design.

So the collector clones separately, commits, and pushes to GitHub. The serving
checkout learns about the new data the same way it learns about a merged pull
request: by pulling. Git stays the only channel between them.

## Components

### Firecrawl retrieval

A client at `src/lib/pipeline/firecrawl.ts` posting to `/v2/scrape` with
`formats: ["markdown"]`. The base URL comes from `FIRECRAWL_URL`, defaulting to
`http://127.0.0.1:3003`, so local development and CI can point elsewhere or
disable it.

Two properties of the Argus deployment the client must respect:

- **Always port 3003, never 3002.** 3002 is the raw API and is down whenever the
  stack is idle. Calling it directly produces connection-refused errors that look
  like source outages. This has already caused a false alarm on another project.
- **The first request after idle is slow.** The client uses a longer timeout for
  the first call of a run than for subsequent ones, rather than treating a cold
  start as a failure.

Retrieval order becomes HTTP, then Firecrawl. `fetchStrategy: 'browser'` sources
go to Firecrawl directly. Playwright is kept for one cycle as a third fallback so
the change is reversible, then removed along with the Chromium install.

### Claude judgment

`classify.ts` keeps its interface and changes its implementation. For each new
candidate it returns relevance, a confidence, a jurisdiction and type guess, and
a draft summary.

Four constraints, and they are the point of the design rather than caveats:

1. **Claude receives text and returns JSON.** It has no file access, no shell and
   no network. The pipeline does the writing.
2. **Its output is validated** against the existing schemas before it is
   persisted. Malformed output is a failed item, not a corrupt record.
3. **Nothing it produces is verified.** Every record it touches stays at
   `verification.status != 'verified'` and remains in the radar until an editor
   confirms it against the primary source. The trust model's central distinction
   is unchanged.
4. **`data/policies.json` stays untouched.** The existing guard, which fails the
   run if the collector modifies the curated register, is kept and becomes the
   most important check in the pipeline.

Claude is called only for candidates that survive dedup against watch-state, so
cost scales with new items rather than with pages fetched.

Authentication reuses the Claude Code credentials already on Argus. This is
chosen for having no new secret to manage, and it has a real cost: the
credential can expire and require an interactive login. The collector therefore
treats an auth failure as a distinct, loudly reported condition rather than as a
generic run failure, because the fix is a human logging in.

### Scheduling and alerting

`policai-collect.service` and `.timer`, daily at 19:30 UTC to match the current
schedule, with `Persistent=true` so a run missed while the machine was off is
caught up.

Failures open or comment on a GitHub issue, exactly as `collect.yml` does now,
deduplicating into one open issue at a time. `gh` is already authenticated on
Argus. A silent collector is the failure mode that matters most here, because
unlike the site going down, nobody notices it from the outside.

### Retiring the workflow

`collect.yml` loses its `schedule:` trigger but keeps `workflow_dispatch`, so
there is a working fallback for one cycle. Once Argus has produced a clean run,
the workflow is deleted.

## Documentation, which is required work

The methodology page, `AGENTS.md`, `docs/trust-model.md`, `docs/collector.md` and
`README.md` currently state that analysis is deterministic with no external AI
provider. After this change that is false.

Each is rewritten to say what actually runs: retrieval through self-hosted
Firecrawl, relevance and draft summaries from Claude, and every model-touched
record held as unverified until an editor checks it against the primary source.

On a site whose purpose is to be trustworthy about Australian AI policy, an
inaccurate claim about its own use of AI is the most damaging defect available.
This ships in the same change as the code, not after it.

## Failure modes

| Failure | Handling |
| --- | --- |
| Firecrawl cold start exceeds the normal timeout | Longer timeout on the first call of a run; not treated as a source failure. |
| Firecrawl stack down | Fall back to HTTP, mark affected sources unreached, report degraded coverage as now. |
| Claude auth expired | Distinct error, reported as needing an interactive login, not a generic failure. |
| Claude returns malformed JSON | Item fails validation and is skipped; the run continues and reports the count. |
| Claude judges a record relevant when it is not | Contained by design: it lands unverified and an editor sees it in the radar. |
| Collector cannot push | Retry with rebase as `collect.yml` does; report after three attempts. |
| Run overlaps the previous one | systemd will not start a second instance of the same service. |

## Success criteria

- A scheduled run on Argus retrieves, judges, validates, commits and pushes
  without manual help.
- The data commit reaches policai.org through the existing pull timer.
- `data/policies.json` is byte-identical before and after every run.
- Coverage improves: the two currently failing sources are reached, and the
  `manual` source is reachable through Firecrawl.
- A forced failure opens a GitHub issue.
- The published documentation matches what the collector actually does.

## Out of scope

- Changing the editorial review workflow, or reducing what an editor must
  confirm. Claude shortens the queue; it does not approve anything.
- Any model involvement in the curated register in `data/policies.json`.
