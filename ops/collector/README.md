# Host collector wrapper

`policai-collect.sh` is an executable **Python 3** program with the historical
entry-point name. Do not run it with `bash`. It needs standard-library Python,
Git, authenticated GitHub CLI, npm and the existing public TLS intermediate at
`~/.local/share/policai/geotrust-tls-rsa-ca-g1.pem`. No cloud credentials are read;
the approved scheduled classifier remains heuristic.

## Verify and install

```sh
python3 -m unittest discover -s ops/collector -p 'test_*.py' -v
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
  validated committed run in `ready` or `published` phase. It verifies exact
  local/remote heads and PR identity, never reruns collection, rebases JSON,
  overwrites a branch or bypasses a refusal.

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

One open `automation/collection-*` PR deliberately blocks new scheduled runs.
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
