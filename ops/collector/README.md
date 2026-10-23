# Host collector wrapper

`policai-collect.sh` is an executable **Python 3** program with the historical
entry-point name. Do not run it with `bash`. It needs standard-library Python,
Git, an authenticated GitHub CLI, npm and the public TLS intermediate at
`~/.local/share/policai/geotrust-tls-rsa-ca-g1.pem`. It reads no cloud
credentials. Relevance uses the keyword rules unless the unit sets
`USE_CLEF_CLASSIFIER=1`, which uses the local `clef-flash` model. The cloud
classifier variables (`USE_CLAUDE_CLASSIFIER`, `CLASSIFIER_BASE_URL`,
`CLASSIFIER_API_KEY`) refuse.

## What one run does

1. Take `~/.local/state/argus-jobs/policai-collect.lock`. A second run exits 75.
2. Fetch `origin/main` and reset the one reusable worktree,
   `~/Work/Argus/src/policai-collector-work`, to it. Untracked files except
   `node_modules` are removed. `npm ci` runs only when `package-lock.json`
   differs from the last install.
3. Run `npm run collect` with `POLICAI_COLLECTOR_STATE` set to the collector's
   host state (below). The run writes its next state to `next/` there.
4. Check the output. The curated register must be byte-identical, and only
   `data/developments.json`, `data/source-reviews.json`,
   `data/watch-state.json` and `public/data/meta.json` may change. Then run
   `npm run validate:data`.
5. Promote `next/` to the host state.
6. Commit on a new `automation/collection-<run-id>` branch, push it and open a
   **ready** PR. The repo's auto-merge workflow arms it, and it merges when
   the required checks pass. Older open collection PRs are closed with a
   comment naming the new one.

The budget is 3,500 seconds inside the unit's one-hour timeout.
`POLICAI_COLLECT_MAX_SECONDS` can shorten it, never extend it.

## Host state and the outbox

`~/.local/state/argus-jobs/policai-collector/` is the collector's memory:

- `watch-state.json` is what the collector has seen, host backoff and robots
  caches, and the per-source health ledger. It replaces main's copy as the
  run's input. Main's copy is the published view.
- `outbox.json` holds the developments and source reviews the collector found
  that main does not have yet, by id. Each run replays them into its output
  and drops any whose id main now carries.

So it does not matter whether the last PR merged, was closed, or went stale
because main moved: the next run's PR carries every finding main lacks. Nothing
waits for a person, and no run blocks the next one.

State is promoted only after validation passes. A run that fails validation,
times out, is interrupted or changes the register publishes nothing and
promotes nothing, so the next run starts from the last good state.
Deleting the folder makes the next run start from main's `watch-state.json`
with an empty outbox. Findings only in the outbox are then rediscovered only if
their pages are still listed.

## Failures

Every failure exits nonzero, which triggers `policai-collect-alert.service`.
It opens one `collector-failure` issue, or comments on the open one, with the
run's receipt and the last journal lines. A run whose coverage health is
`failed` still publishes its structurally valid output and still exits
nonzero, so the alert fires.

Receipts:

- `~/.local/state/argus-jobs/policai-collect.json` is the latest attempt.
- `~/.local/state/argus-jobs/policai-collection-runs/<run-id>/` holds that
  run's `run.json`, before and after copies of the allowed outputs and the
  register, and the install, collect and validate logs. Evidence older than
  30 days is deleted at the start of a run.

The worktree is reset by the next run, so inspect a failed run's evidence
folder, not the worktree.

## Commands

- `~/.local/bin/policai-collect.sh` runs the scheduled path.
- `~/.local/bin/policai-collect.sh --preflight` checks that the remote and
  GitHub are readable and that the lockfile and CA exist. It collects and
  publishes nothing.

## Verify and install

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ops/collector -p 'test_*.py' -v
npm run check
```

The tests use real temporary Git repositories. Only npm and GitHub are fakes,
and they never contact official sources or push to GitHub.

Installing on Argus is a reviewed host step. Back up the installed wrapper,
then, with the lock held, copy the tested source over it atomically and check
its SHA256:

```sh
cp -p ~/.local/bin/policai-collect.sh ~/.local/bin/policai-collect.sh.bak
( flock -x -n 9 || exit 75
  T=$(mktemp ~/.local/bin/.policai-collect.sh.XXXXXX)
  cp ops/collector/policai-collect.sh "$T"; chmod 755 "$T"
  mv -f "$T" ~/.local/bin/policai-collect.sh
  sha256sum ~/.local/bin/policai-collect.sh ) 9<~/.local/state/argus-jobs/policai-collect.lock
```

Record the source commit and installed digest in the change report.

## Units

The systemd user units in `ops/collector/systemd/` are the source for
`~/.config/systemd/user/` on Argus:

- `policai-collect.service` sets `USE_CLEF_CLASSIFIER=1` and a 4 GiB memory
  ceiling.
- `policai-collect.timer` runs it daily at 19:30 UTC.
- `policai-collect-alert.service` runs `policai-collect-alert.sh` on failure.

Install them as a reviewed host step:

```sh
install -m 644 ops/collector/systemd/policai-collect*.service ops/collector/systemd/policai-collect.timer ~/.config/systemd/user/
install -m 755 ops/collector/policai-collect-alert.sh ~/.local/bin/
systemctl --user daemon-reload
```

The unit carries the environment, so drop-ins under
`policai-collect.service.d/` that set the same variables can be removed.

## Moving from the per-run layout

Earlier wrappers kept a worktree per run under
`~/Work/Argus/src/policai-collection-runs/`, an active-run pointer at
`~/.local/state/argus-jobs/policai-collection-active.json`, and a pending-PR
gate. This wrapper reads none of them. After the first successful run, remove
the old worktrees with `git worktree remove` from the source checkout and
delete the pointer. Findings those runs never published are found again,
because main's watch state never marked them seen.
