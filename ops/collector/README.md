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

- `~/.local/bin/policai-collect.sh --preflight`: clean source, readable remote and
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
boundaries refuse inventory. Nothing but `node_modules` is ever deleted (see
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
  do not match the wrapper's own layout for one run id keep every run;
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
