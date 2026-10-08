# Host collector wrapper

`policai-collect.sh` is an executable **Python 3** program with the historical
entry-point name. Do not run it with `bash`. It needs standard-library Python,
Git, authenticated GitHub CLI, npm and the existing public TLS intermediate at
`~/.local/share/policai/geotrust-tls-rsa-ca-g1.pem`. No cloud credentials are read;
the approved scheduled classifier remains heuristic.

## Verify and install

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ops/collector -p 'test_*.py' -v
npm run check
```

The tests use real temporary Git repositories; only npm and GitHub are stubs.
They never contact official sources or push to GitHub. Set `TMPDIR` to a local
scratch directory if the host has a specific temporary-file policy.

Installation needs explicit host-change approval. Preserve the installed bytes,
mode and digest first. With the existing
`~/.local/state/argus-jobs/policai-collect.lock` held exclusively, copy the tested
source to a new sibling of `~/.local/bin/policai-collect.sh`, set executable
permissions and atomically replace only that entry point. Verify byte equality
and its SHA256. Release the lock before invoking the wrapper (no nested lock).
No units, guard pins, backup scripts, credentials or deployment clones change.
Source review and installed-wrapper approval are separate: record the exact
source commit/PR and installed digest in the change report.

## Commands and evidence

- `~/.local/bin/policai-collect.sh --preflight`: clean source, a valid or
  absent active pointer (see Active pointer below), readable remote and
  GitHub, lockfile/CA presence; no collection/publication. It does not prove
  source health, pending-PR readiness or that a previous failed run is resolved.
- `~/.local/bin/policai-collect.sh`: full scheduled path. The total subprocess
  budget is 3500 seconds within the unchanged one-hour service timeout.
  `POLICAI_COLLECT_MAX_SECONDS` can shorten, never extend, the budget. Opt-in
  dependency retention runs first on its own budget of at most 60 seconds; the
  collection budget starts after it (see Dependency retention).
- `~/.local/bin/policai-collect.sh --retry-publication`: only a previously
  validated committed run in `ready`, `superseding` or `published` phase. It
  verifies exact local/remote heads and PR identity, never reruns collection, rebases JSON,
  overwrites a branch or bypasses a refusal.

- `~/.local/bin/policai-collect.sh --storage-status`: read-only JSON inventory
  of retained worktrees and evidence. It takes the existing lock (without
  creating it), exits 0 for a completed inventory even when `admitted` is false,
  75 for lock contention, and 1 for an invalid cap, missing lock or unsafe/
  unreadable inventory. It never writes a receipt or runs collection.

`POLICAI_COLLECT_CAP_BYTES` is a positive decimal byte count (default
10737418240, 10 GiB). A new run is refused when retained apparent bytes plus
1073741824 bytes (1 GiB headroom) reach or exceed the cap. This is an admission
check, not a hard disk quota; a running collection can grow beyond its headroom.
Publication retries do not create another worktree and bypass admission.
Inventory counts inode sizes, including directory and symlink sizes, without
following symlinks. Aliased/symlinked roots, special files and mount/device/owner
boundaries refuse inventory. Mount boundaries use the same rules as dependency
retention: any mount point at or under a storage root in `/proc/self/mountinfo`
(including a same-device bind mount, which device numbers and `Path.is_mount`
miss) refuses, every directory walked must have the root's kernel mount id
(`/proc/self/fdinfo`), and an unreadable or unparseable mount table refuses.
A bind-mounted subtree is therefore never counted twice or walked into; the
refusal names the mount boundary instead of a misleading cap result. The walk
is descriptor-relative and read-only. Nothing but `node_modules` is ever deleted (see
Dependency retention below); evidence and run trees need manual retention review.

- `~/.local/bin/policai-collect.sh --retention-plan`: read-only JSON report of
  which finished runs could have `node_modules` removed, and why every other run
  is kept. It reads GitHub (read-only) but writes nothing. Existing lock only:
  exit 75 on contention, 1 for a missing lock or any unverifiable global state.
- `~/.local/bin/policai-collect.sh --retention-apply`: removes the `node_modules`
  of the runs the plan calls `eligible`, re-checking each one first. Exit 1 if a
  removal fails (the rest of the pass stops). Never starts a collection.

Latest attempt: `~/.local/state/argus-jobs/policai-collect.json`.
Retained active run: `~/.local/state/argus-jobs/policai-collection-active.json`.

**Active pointer.** Collection, `--retry-publication`, `--preflight` and
dependency retention read the pointer through one strict reader. Only a pointer
that genuinely does not exist (`lstat` reports `FileNotFoundError`) means "no
active run". A symlink (dangling or not), a directory or other non-regular
file, unparseable JSON, a non-object, evidence/tree/branch values that do not
match the wrapper's own layout for one run id, or a phase that is missing or
not one the wrapper writes (`collecting`, `ready`, `superseding`, `published`,
`no-changes`) stops the
invocation with exit 1 and a message naming the pointer, before retention, a
new run, a publication retry or a passing preflight. The invalid pointer is
left exactly as found: it is not followed, rewritten or replaced. Investigate
it like an incomplete run (below); do not delete it to make the timer pass.
A valid pointer, and genuine absence, behave as before.

Evidence: `~/.local/state/argus-jobs/policai-collection-runs/<run-id>/`.
Dedicated worktree: `~/Work/Argus/src/policai-collection-runs/<run-id>/`.
Each run retains `run.json`, before/after allowed outputs and register hashes,
plus npm installation, collection and validation logs. Unexpected files stay
in the retained worktree and are never added to the publication commit. The
output gate unions index, working-tree and untracked changes: restoring working
bytes does not conceal staged changes (including the curated register). After
staging the four allowed paths, the wrapper checks the entire index again before
committing. Refused index entries are preserved, not reset or unstaged; inspect
`git diff --cached` as well as `git diff` in the retained worktree. Snapshot files
capture working-tree bytes, not a separate copy of index-only content.

An unhealthy collection can publish structurally valid failed-health and retry
state in a **draft** PR, but its job exit stays nonzero. Register mutations,
unexpected paths, validation failures and timeouts never publish. Signals and
timeouts terminate the owned process group before snapshotting. A hard kill or
power loss cannot run a finalizer: the initial snapshot, active receipt and
worktree remain; manually inspect them before any retry.

## Review and recovery policy

By default, one open `automation/collection-*` PR blocks new scheduled runs.
Review/merge/close that PR before collecting again. No pending JSON is overwritten.
While the oldest pending PR is younger than `POLICAI_COLLECT_REVIEW_GRACE_HOURS`
(default 72), a blocked run is a normal wait: it exits 0 and its receipt records
`"skipped": "awaiting-review"`, so `OnFailure=` alerts and topology drift stay
reserved for real faults. Past the grace period, or when the PR age cannot be
read, the blocked run exits 1 so a forgotten review surfaces.
Main requires an approving review and lint/test/build checks. Merging collected
data and approving register entries are separate decisions; neither happens here.
The wrapper uses only unique collection branches, so a branch push cannot activate
the existing main-following app deployment timer.

### Opt-in state-only supersession (policy proposal)

`POLICAI_COLLECT_SUPERSEDE_STATE_ONLY` defaults to `0`; only the exact value `1`
enables this proposal. Other values refuse the run. It requires maintainer
approval to enable (host environment change); installing the source is a
separate approved host step. Leaving the toggle off preserves the review wait
above.

When every pending collection PR is state-only, an enabled run may start from
freshly fetched `origin/main`, never from unmerged state. Eligibility requires:

- an unreviewed draft (`isDraft=true`, `reviewDecision` empty or
  `REVIEW_REQUIRED`, and no reviews), on a same-repository
  `automation/collection-*` branch targeting `main`;
- a retained local `published` collector receipt matching the PR URL, branch
  and exact head, with equal, nonempty `register_before`/`register_after` hashes;
- fetching main and that exact remote branch head, proving the recorded base
  is an ancestor of `origin/main`, and a single collector-authored commit;
- a complete non-renaming Git diff against that base containing only
  `data/watch-state.json` and/or `public/data/meta.json`;
- equal register Git blobs at that base and head as a second check.

Missing provenance, unreadable/mismatched hashes, other paths (including
`data/developments.json` or `data/source-reviews.json`), forks or another base
keep the ordinary review wait. Inspection failures refuse rather than assume
eligibility. Receipts from another host must be reviewed manually; a branch
prefix or a claim in a PR body is not sufficient provenance. The author-name/email
check is only a consistency check: those strings can be forged and are not an
independent safeguard. The matching retained receipt and Git checks establish
eligibility. Ready or reviewed PRs always keep the ordinary gate.

The new receipt records `superseded_prs` with each URL, branch, head and a
`planned`/`closed` status. Older run trees, receipts, snapshots and branches are
never overwritten or deleted. After output/structural validation and an inventory
recheck, the wrapper pushes the replacement branch, creates its draft PR and
verifies the exact head/base/open/draft state and whole superseded URL tokens in
its body. Only then does it recheck old PR eligibility, comment on and close them
**without merging or deleting branches**, and verify each closure/comment. The
closing comment links the verified replacement. Draft/review state is read again
immediately before closing, so a PR promoted or reviewed during collection is
not intentionally closed. Closure prevents an ordinary later approval from
merging obsolete state over the replacement.

A no-changes run, successful or failed, leaves all old PRs open and adds no
closing comment. Its receipt keeps `superseded_prs` entries as `planned`, but
there is no replacement and no supersession. These entries record the unused
plan, not pending closure work; the original collection exit is returned. A later
run with changed output can replace the pending state. With the toggle on and
no merges, changed output can cause daily PR churn while main's watch
state/freshness remains unchanged.

Main is checked before/after closure and around publication. A concurrently
merged old PR or changed head stops further publication/closure for manual reconciliation;
there is no automatic rebase. A reopened PR whose closure was recorded blocks
publication retry. GitHub closure and Git pushes are not one atomic transaction:
an administrator can still deliberately reopen/merge later. Do not do so without
reconciling the replacement. This is not a replacement for merge review.

Validation, push, create or replacement read-back failure leaves old PRs open;
the replacement stays `ready` locally and may already have an open draft. Once
replacement read-back succeeds, the receipt is `superseding` until every planned
closure is verified. A close failure returns nonzero: both the replacement and
any old PR not yet closed remain visible, never an empty review queue. For
multiple old PRs, earlier successful closures remain recorded. A failed closure
read-back can mean the old PR closed remotely even though its receipt still says
`planned`; inspect both PRs and the receipt. If that PR is reopened before
closure is recorded, retry can close it again. Partial-comment recovery is
unchanged: an existing exact supersession comment is not duplicated.

New collection refuses an incomplete `ready` or `superseding` run. After an
authorised repair, use `--retry-publication` with the toggle still enabled. Retry
reuses the exact commit and existing replacement, re-verifies it before closure,
and checks existing comments/closures without recollection or duplicate comments.
Only complete verified closure changes the phase to `published`. Retry of an
already `published` run retains that phase even if rechecking fails, so it does
not create an incomplete-run blocker for the timer. The failed retry still
returns nonzero, and the normal pending-PR gate still applies. A replacement
that was merged, closed or marked ready, a reviewed old PR, or a reopened PR
whose closure was recorded requires manual reconciliation for retry. A later
scheduled run may supersede a reopened PR again unless it is reviewed or taken
out of draft; mark it ready or review it to keep it. Storage admission still
bounds new runs; opt-in supersession does not authorise cleanup or make coverage
health successful. A failed-health run can still supply structurally valid
state, but its original nonzero collection exit remains nonzero.

### Incomplete runs

An incomplete prior run also blocks new collection. Read its receipt and logs,
compare the before/after register, and inspect staged/untracked paths in its exact
worktree. A `ready` run can retry publication after an authorised connectivity
repair. If main advanced, a reviewer must reconcile the retained commit; the
wrapper will not resolve JSON conflicts. Once an incomplete run has been reviewed
and its useful evidence preserved, an authorised operator can **archive** the
active pointer to a uniquely named sibling to permit a fresh run. Do not delete
the evidence, reset the source checkout, or remove the worktree automatically.

For example, GitHub can create the PR but fail its read-back, leaving the active
pointer at `ready`. If that PR is then merged before read-back is recovered, a
normal invocation still refuses the incomplete pointer, and publication retry
refuses because main advanced. Waiting or repeatedly retrying does not clear
this state. Verify the actual PR, merged commit and retained evidence first;
then use the separately authorised manual review/archive-pointer route above.
Do not archive a normal `published` pointer just because its PR was merged:
a successfully recorded publication resumes normally once no collection PR is
open. No automatic merged/closed-PR reconciliation is implemented.

## Routine collection review gate — SHADOW ONLY (X60)

`collection_review_gate.py` is a standalone, stdlib-only assessor, offline by
default. It has **no merge action** and no wrapper, CI or timer integration.
`--clef-advisory` opts into the local log-only check below. Exit 0 means
`would-merge`, not permission to merge; exit 1 means `would-escalate`. Both print
structured JSON, with the exact
base/head, policy version, evidence manifest path/digest, reasons and a one-line
`summary` for a digest. This phase does not activate the X60 standing rule or
bypass the existing pending-PR gate. It cannot approve a PR touching
`data/developments.json`, `data/source-reviews.json`, register content, source
identity, exceptions or code. In particular, it does not authorise PR #155.

### Trusted acquisition boundary

Run this reviewed script from a trusted checkout, **not the candidate PR's
copy**. The candidate checkout must be clean and at the exact full head SHA.
Git reads pinned commit objects; the gate never checks out or executes candidate
code. A nonempty diff may contain only ordinary `100644` modifications to the
exact paths `data/watch-state.json` and `public/data/meta.json`. Additions,
deletions, renames, symlinks, other modes and basename lookalikes refuse.

The collector/coordinator must acquire and retain evidence independently of the
PR author: capture the scheduled-run receipt and scheduler provenance; inspect
the approved source inventory and both schedules; obtain actual test, lint,
build and data-validation receipts at the exact head; arrange the independent
read; and retain source text for any date checks. Run checks only in the normal
trusted/sandboxed verification workflow, not through this assessor. Do not copy
PR-owned claims, comments, model prose or PR artifacts into an apparently trusted
receipt. The gate accepts **attestations, not authenticated ground truth**:
`acquired_by`, scheduler and model strings are not signatures, and content
hashes establish byte identity, not honesty or completeness. It cannot prove
that CI, a scheduled run or an independent review happened. The coordinator
must verify those facts and remote base/head immediately before assessment;
a changed remote SHA invalidates the old result. Never claim external CI ran
from the presence of an input JSON file.

All input artifacts, manifest, output and ledger must be outside the candidate
checkout, at absolute non-symlink paths in coordinator-controlled directories.
The local path restriction is defence in depth, not authentication: copying a
PR-authored file elsewhere does not make it trustworthy. Keep these directories
private from PR jobs and source content, including concurrent path replacement.
The gate reads source text as data only; it does not interpret instructions in it.

### Evidence format, version 1

The coordinator writes one JSON manifest with these required fields (unknown
fields confer no authority). JSON duplicate keys and non-finite numbers refuse.
Every `artifact` below is `{"path":"/absolute/retained/file","sha256":"<64 lowercase hex>"}`;
its bytes must exist and match the digest. Paths are never fetched as URLs.

- `schema_version`: integer `1`; `base`, `head`: full, exact 40-character Git
  commit SHAs; `acquired_by`: `"coordinator"`; `clean`: boolean `true`.
- `run`: `id` (1–128 ASCII letters/digits/dot/underscore/hyphen), `kind`
  (`"scheduled"`, `"historic"` or `"synthetic"`), and `artifact`. For scheduled
  runs also set `scheduler: "policai-collect.timer"`. The artifact must be the
  coordinator-verified receipt/scheduler evidence binding this run to base/head;
  the existing wrapper does not yet generate this manifest.
- `receipts`: exactly four objects, uniquely named `tests`, `lint`, `build`,
  `data-validation`; each has `head`, `status: "success"`, integer
  `data_errors: 0`, and `artifact`. Missing, pending, stale or failed receipts
  refuse. A local `npm run check` log can support all four if the coordinator
  actually ran it on that head and verifies all stages and zero data errors.
- `review`: `base`, `head`, `status: "completed"`, `vendor: "ollama-cloud"`,
  `model: "glm-5.3"`, `findings: []`, and `artifact`. This initial shadow policy
  admits GLM 5.3 only while Claude is paused. The coordinator must arrange an
  actual independent cross-vendor review, retain its report and verify its
  identity and SHA; the gate does not call the model. Wrong identity/SHA,
  missing/pending review, any finding or a nonempty `flags` field refuses. Later model-policy changes
  require review, not a free-text override.
- `coverage`: `automatic_source_ids` (complete, unique nonempty list),
  `manual_source_count` (nonnegative integer), `base_due` and `head_due`
  (objects mapping every automatic source ID to a boolean), and `artifact`
  retaining the inventory and scheduling calculation at both commits. Do not
  derive this evidence solely from the candidate's self-reported meta totals.
- `dates`: an array covering **exactly** new or changed watch-state candidates,
  keyed by their `seen` map key. Each object has `key`, `source_id`, `url`,
  `artifact` (retained UTF-8 source text), and nonempty `values`. Each value is
  `{"kind":"published","value":"7 October 2026"}` or an `updated` value.
  The raw values must occur in the retained text. Include all relevant,
  potentially conflicting publication/update hints, not only the convenient
  one. Normal retry-attempt changes with an identical candidate need no new
  date proof. Removed candidates or missing new-candidate details refuse.

The synthetic fixture builder in `test_collection_review_gate.py` is an
executable example of the complete manifest, including date entries. Its
receipts, sources, scheduler and human decisions are explicitly **synthetic**;
none establishes actual CI, review or trial progress.

### Coverage and date policy

The gate reconciles per-source rows with the independent inventory, schedule,
checked IDs, success/failure/skipped totals, error list and rounded success
rate. Missing rows, duplicate IDs, invalid types/statuses/counts, hidden errors
and inconsistent eligibility refuse. `coverageEligible: false` retries and
skipped sources never count as successful coverage or recovery. Comparisons
label scheduling changes and not-due rows separately. The gate does not treat a
not-due row as proof of health. Every head error, including explicit new
success-to-error transitions and continuing failures, escalates for human
review; making a failure explicit is necessary, not sufficient to pass.

The proposed shadow count-drop limit is **at most 20% for each comparable,
successful source**, checked with integer arithmetic:
`(base_count - head_count) * 100 <= base_count * 20`. Positive-to-zero always
refuses. Known zero baselines permit zero or growth without inventing a
percentage; missing counts are unknown and refuse when due/successful or
comparable. Aggregate growth cannot offset another source's drop. This 20%
number is a **proposal requiring acceptance before live activation**, not a
number already approved by Daniel.

`src/lib/pipeline/extract.ts:parseSourceDate` preserves the source calendar
date, including the leading date of an ISO timestamp. Its tests explicitly
reject rolling that calendar day through UTC. Month/year hints are anchored
on the first day with `dateHintPrecision: "month"`/`"year"`, never silently
upgraded to day precision. `collect.ts` carries those hints into candidates and
publication fields; retrieval/fetch time is not publication evidence.

The gate uses a conservative parser for ISO day, offset-bearing ISO timestamp,
ISO month/year, English month/day dates and day/month/year numeric dates.
Unsupported or ambiguous formats escalate instead of guessing. All supplied
publication and update values must agree on date **and precision**, with at
least one publication value; updated-only evidence escalates in this shadow
policy even where extraction accepts an update hint. New/changed candidates
without source-date evidence, mismatched hints/precision or contradictory
metadata refuse. A bare `7 October 2026` cannot justify `2026-10-06` by an AEDT
conversion; even `2026-10-07T00:30:00+11:00` retains `2026-10-07` under the traced
rule. These are synthetic offline examples, not a conclusion about the
independent DTA date investigation. No source facts are rewritten by the gate.

### Operator command and three-run comparison

Choose the evidence directory explicitly; the parent directory must already
exist. Replace the placeholder variables with coordinator-verified paths/SHAs:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /trusted/policai/ops/collector/collection_review_gate.py \
  --repo "$CANDIDATE_CHECKOUT" --base "$BASE_SHA" --head "$HEAD_SHA" \
  --evidence "$EVIDENCE_DIR/manifest.json" \
  --output "$EVIDENCE_DIR/shadow-result.json" --ledger "$EVIDENCE_DIR/shadow-ledger.json"
```

Without `--output`/`--ledger`, the assessor writes only stdout. With a ledger,
it uses a sibling `.lock` file and atomic replacement, with one record per
run ID/head and deduplicated assessment history. Repeated identical input does
not add an evaluation or run. Different heads for one run still count once.
Corrupt/duplicate/inconsistent ledgers refuse and remain untouched; retain
stdout as evidence of that refusal. Do not discard failed assessments or
rewrite disagreements to make the trial pass. An unidentified/malformed run
cannot be placed safely in the ledger; retain its structured stdout and
reconcile its provenance manually.

1. For each of the next three **genuine scheduled collections**, acquire the
   above evidence, run the gate and retain stdout/output and the manifest.
   Historical and synthetic replays never count. Scheduler provenance is
   coordinator-attested, not inferred from a branch name or timestamp. Tests
   use temporary ledgers, never the host ledger. Failed scheduled assessments
   count as observations, not as successes.
2. A human independently reviews the exact same base/head and records the
   ordinary decision using the existing approval process. Until known, the
   ledger's `human_decision` is `pending`. To record the result, repeat the
   command with `--human-decision merged|escalated|rejected` and
   `--human-artifact /absolute/retained/decision.txt`. This only records an
   attestation and its digest: **it does not merge or escalate anything**.
   Both assessment and human-decision histories are preserved; `disagreement`
   remains true if any retained assessment disagrees with a human decision.
3. Compare all three distinct scheduled run IDs, each exact head, every reason,
   human decision, unresolved failure and disagreement. Pending human decisions
   do not complete the trial. Carry the output `summary` into the digest, with
   `live_action=none`; retain artifact links beside it. Raise a new activation
   **E item** containing the three-run matrix and requesting explicit acceptance
   of the proposed threshold, trust boundary, reviewer identity and future live
   design. Do not update standing approvals as live or install anything here.

Any future live path must be separately reviewed/approved and use squash via
`factory merge`, never `--admin`. Three observations do not themselves activate
anything. This PR stops at source, tests and operating documentation.

### Clef-flash advisory check 5 — opt-in, log-only

Run the trusted gate command above with `--clef-advisory`; retain the entire
JSON result/ledger, not only its deterministic summary. The `clef_advisory`
record cannot change checks 1–4, reasons, verdict, exit status or the required
GLM 5.3 independent review. Flags, skips and errors never approve anything.
There is no collector trigger, source fetch, cloud fallback or installation.

The request uses only pinned changed candidates, retained digest-checked source
text/dates and base/head per-source counts, statuses and schedules. It includes
at most 24 items and 128 source comparisons, with 48,000 bytes of serialized
state and 64 KiB of request JSON. Field limits and omitted/missing context are
reported in `coverage`; truncated JSON fragments are data strings, not commands.
Individual retained artifacts over 4 MiB refuse advisory context. Source text is
untrusted; prompt boundaries reduce but cannot eliminate model prompt injection.

Before HTTP, bounded telemetry requires at least 13 GB free
(13,000,000,000 bytes; nvidia-smi MiB converted without rounding up) and no
known game process. Minecraft is a `java`/`javaw` process with a minecraft/lwjgl
argument, or the exact `minecraft` process name. Steam reaper/app processes and
non-helper game descendants block; an idle Steam launcher, desktop/browser
clients and their helper subtrees do not. No graphics-client inventory is used:
voxtype-osd, Hyprland and browsers never block merely because they use the GPU.

For other games, set `POLICAI_CLEF_GAME_PROCESSES` per invocation to at most 16
comma-separated exact process names, case-insensitive, for example
`POLICAI_CLEF_GAME_PROCESSES=rivet,another-game`. Names must be 1–64 ASCII
letters/digits/dot/underscore/hyphen, with no spaces, wildcards or paths; use the
name reported by `ps`'s `comm` field, including any kernel truncation. Empty
means no extra names; Minecraft/Steam detection remains enabled. This does not
edit host configuration or read an environment file. Invalid configuration,
failed/malformed telemetry or an unsupported multiple-GPU result still skips
safely. Known games/low VRAM record `skipped: gpu busy`; telemetry-only failures
record `skipped: telemetry unavailable`. Every collected cause is retained in
`gpu.reasons` and the combined `reason`, including simultaneous game/VRAM/errors.
Telemetry calls each have a five-second bound. A game starting after inspection
remains a race; this is not a GPU reservation.

HTTP connects directly to `127.0.0.1:11434`, ignores proxy settings and refuses
redirects. A bounded `/api/tags` read verifies the installed `clef-flash` digest;
absence records `skipped: model missing`, never a pull. The only inference path
is `/v1/systemone`, model `clef-flash`, `keep_alive: "5m"`. One owned client
process enforces a 30-second total network deadline; overdue client termination
cannot cancel inference already accepted by Ollama. No games/services are killed.

Three `noul` questions flag off-topic items, implausible dates and anomalous
counts at P(true) >= 0.5. This is a logging threshold, not a calibrated rule.
Request/question identity, full input and digest, response and digest, installed
model digest, exact SHAs, run provenance and coverage are retained. The verified
[System One schema](https://docs.ollama.com/api/systemone) and
[clef-flash example](https://ollama.com/library/clef-flash) return `noul` as
P(true), without requiring a confidence field. We retain both probabilities and
explicitly label derived concentration `1 - binary_entropy(P(true))` as
`confidence`; optional provider confidence is separately validated/preserved.
Neither concentration is calibrated correctness; no provider value is invented.

After an independent human review, write an external comparison JSON containing
`base`, `head`, `run_id`, `input_sha256`, `response_sha256` from the retained
completed advisory; `review_complete: true`; `reviewed_questions` containing
all three question IDs; and `reviewer_findings`, an array of
`{"question_id":"off_topic","detail":"reviewer finding"}`. Question IDs are
`off_topic`, `implausible_dates`, `anomalous_counts`, or `other` for findings
outside these checks. An empty array means the human actually found nothing.
Keep the comparison/report in the coordinator-controlled evidence directory.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /trusted/policai/ops/collector/clef_shadow.py compare \
  --repo "$CANDIDATE_CHECKOUT" --ledger "$EVIDENCE_DIR/shadow-ledger.json" \
  --comparison "$EVIDENCE_DIR/human-clef-comparison.json"
PYTHONDONTWRITEBYTECODE=1 python3 /trusted/policai/ops/collector/clef_shadow.py trial \
  --repo "$CANDIDATE_CHECKOUT" --ledger "$EVIDENCE_DIR/shadow-ledger.json"
```

Comparison history retains findings, artifact digest and matched/missed/false
flags by question category, not inferred item-level matches. Replays are
idempotent. Only three distinct coordinator-verified scheduled run IDs with
completed, untruncated inference and complete human comparisons complete this
additional trial. Synthetic/historic fixtures, skips, errors, partial context and
pending human reviews do not count. The original `scheduled_run_count` still
counts deterministic observations, not completed clef comparisons; use `trial`
for the separate count/incomplete list. A missing comparison or valid partial
context remains incomplete. A malformed stored comparison instead returns
explicit JSON `status: "error"`, exits 1, identifies the run/head/record index,
and leaves the ledger unchanged; it is never disguised as incomplete coverage.
These remain attestations, not signatures. Three comparisons confer no approval
or activation authority.

## Dependency retention

Each run tree holds about 0.9 GB of `node_modules`, and nothing else in a tree
is large. Retention removes **only** `<tree>/node_modules`. The tree, its Git
branch and history, `run.json`, before/after snapshots and the install, collect
and validate logs stay, so the receipts the wrapper relies on (including the
state-only supersession check) are untouched. To rebuild, run
`npm ci --no-audit --no-fund` in the tree; its `package-lock.json` is part of the
retained commit.

A run's `node_modules` is eligible only when **all** of these hold; anything
else, or any check that cannot be completed, keeps it:

- the receipt is `published`, with a parseable `finished_at` at least
  `POLICAI_COLLECT_RETENTION_DAYS` days ago (whole number, default and minimum
  7; a smaller value refuses retention, so the week cannot be configured away);
- it is not the run named by `policai-collection-active.json`. Only a pointer
  that genuinely does not exist means "no active run". A symlink (dangling or
  not), a non-regular file, unparseable JSON, or evidence/tree/branch values that
  do not match the wrapper's own layout for one run id keep every run (the same
  strict reader as collection; see Active pointer above);
- its branch has no open collection PR, and `gh pr view` reports the exact URL,
  branch, head and base from the receipt as `MERGED` or `CLOSED`;
- the receipt's tree, evidence and branch names match the run id and path, the
  tree is an owned real directory and a registered collector worktree, `HEAD`
  and branch equal the receipt, and `git status` is clean;
- no mount point is at or under the tree in `/proc/self/mountinfo`. That table
  also shows bind mounts of directories on the same filesystem, which device
  numbers and `Path.is_mount` miss. An unreadable or unparseable table keeps;
- `node_modules` is an owned real directory with no tracked files, and every
  directory below it has the same device and kernel mount id
  (`/proc/self/fdinfo`) as the tree, no foreign owners and no special files;
- no `retention-intent.json` or `retention-pruned.json` exists, including as a
  dangling symlink (an interrupted earlier attempt needs manual review, not an
  automatic second deletion);
- no process scan hit (below).

Failed, incomplete, no-change, pending and unfinished runs are never pruned.

**Descriptor-anchored removal.** Assessment opens the tree from `/` one path
component at a time with `O_NOFOLLOW | O_DIRECTORY`, and records the
`(st_dev, st_ino)` identities of the tree and its `node_modules`. Removal
re-opens both the same way and refuses unless the identities match, rechecks the
mount table, then writes `retention-intent.json`. It deletes relative to the
held descriptors only: each subdirectory is opened with `O_NOFOLLOW`, must be
the entry just inspected, on the same device and mount; symlinks are unlinked,
never followed; nothing is deleted through an absolute path. Then it removes the
empty `node_modules` from the tree descriptor, verifies it is gone and writes
`retention-pruned.json`. Both marker files are created exclusively and never
replaced. A renamed or symlinked tree, parent directory or `node_modules`
between assessment and removal therefore removes nothing (the run is reported
`failed` and the pass stops). A change detected part-way through removal also
stops it; the intent marker then keeps that run for manual review. Removal is
not transactional.

**Process check, and its limit.** A Linux `/proc` scan keeps a run when any
visible process has the tree as cwd, root, exe, an open descriptor or in its
arguments. The wrapper's own process is skipped, because it holds descriptors
on the tree it assesses. Each link is judged as soon as it is read, so a
reference already seen is never lost when another descriptor of the same
process closes mid-scan. Processes the wrapper could not fully inspect
(permission denied, or a descriptor that vanished while the process lives) are
counted as `unreadable_processes` in the report; they are **not** proof of
inactivity (on a busy host some same-user processes deny inspection, so refusing
on them would block every prune). The remaining risk is a process outside the
scan reading a tree that finished at least a week ago with a terminal PR; the
loss is a reproducible `node_modules`.

**Time budget.** `--retention-plan` and `--retention-apply` have 600 seconds.
In a scheduled run, retention has its own budget of at most 60 seconds
(`POLICAI_COLLECT_RETENTION_SECONDS` can shorten, never extend, it), covering
GitHub and Git calls, the process scan and removal. The collection's full
budget (3500 seconds, or `POLICAI_COLLECT_MAX_SECONDS`) starts only after
retention ends, so slow retention cannot shorten collection or publication.
60 + 3500 seconds stays inside the one-hour service timeout. Removal that hits
its deadline stops and leaves the intent marker (manual review). Make the first
cleanup of existing trees with `--retention-apply`, not the scheduled run.

**Scheduled runs.** `POLICAI_COLLECT_PRUNE_DEPENDENCIES` (`0` default, `1` to
enable; other values refuse the run) makes each scheduled run apply retention
before the storage admission check, including a run that then waits for an open
review PR. Retention errors are printed (`Retention skipped:`) and never block
the collection; the admission cap still applies. `--retry-publication` and
`--preflight` never prune. With the toggle at `0`, scheduled runs delete
nothing; only an explicit `--retention-apply` (itself an opt-in) can remove
`node_modules`.

Installing the wrapper, enabling the toggle and the first prune of the existing
run trees are separate host decisions, not part of the source change. Restoring
a preserved original wrapper requires separate authority and verification; the
old direct-main publisher must not be resumed unattended merely as a rollback
convenience.
