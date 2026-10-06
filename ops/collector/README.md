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
  `POLICAI_COLLECT_MAX_SECONDS` can shorten, never extend, the budget.
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
boundaries refuse inventory. No automatic cleanup is performed; evidence and
run trees require separate manual retention review.

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
closing comment. Its receipt keeps the plan but there is no replacement and no
supersession; the original collection exit is returned. A later run with changed
output can replace the pending state. With the toggle on and no merges, changed
output can cause daily PR churn while main's watch state/freshness remains unchanged.

Main is checked before/after closure and around publication. A concurrently
merged old PR or changed head stops further publication/closure for manual reconciliation;
there is no automatic rebase. A reopened superseded PR blocks publication
retry. GitHub closure and Git pushes are not one atomic transaction: an
administrator can still deliberately reopen/merge later. Do not do so without
reconciling the replacement. This is not a replacement for merge review.

Validation, push, create or replacement read-back failure leaves old PRs open;
the replacement stays `ready` locally and may already have an open draft. Once
replacement read-back succeeds, the receipt is `superseding` until every planned
closure is verified. A close failure returns nonzero: both the replacement and
any old PR not yet closed remain visible, never an empty review queue. For
multiple old PRs, earlier successful closures remain recorded. A failed closure
read-back can mean the old PR closed remotely even though its receipt still says
`planned`; inspect both PRs and the receipt.

New collection refuses an incomplete `ready` or `superseding` run. After an
authorised repair, use `--retry-publication` with the toggle still enabled. Retry
reuses the exact commit and existing replacement, re-verifies it before closure,
and checks existing comments/closures without recollection or duplicate comments.
Only complete verified closure changes the phase to `published`. A replacement
that was merged, closed or marked ready, or an old PR that was reviewed/reopened,
requires manual reconciliation. Storage admission still bounds
new runs; opt-in supersession does not authorise cleanup or make coverage
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

Worktree/evidence retention is explicit and may consume disk. No retention job or
cleanup policy is installed by this workflow. Restoring a preserved original
wrapper requires separate authority and verification; the old direct-main
publisher must not be resumed unattended merely as a rollback convenience.
