#!/usr/bin/env python3
"""Policai collector entry point: historical .sh name, Python 3 stdlib only.

Never collect in main or a serving checkout. Retain every run until reviewed.
Content PRs block collection; state-only supersession is opt-in. Retries never recollect.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import re
import subprocess
import sys
import time
import uuid

HOME = Path.home()
SOURCE = HOME / 'Work/Argus/live/policai-collector'
STATE = HOME / '.local/state/argus-jobs'
RUNS = HOME / 'Work/Argus/src/policai-collection-runs'
ALLOWED = ['data/developments.json', 'public/data/meta.json',
           'data/watch-state.json', 'data/source-reviews.json']
REGISTER = 'data/policies.json'
REPO = 'l0cka/policai'
PREFIX = 'automation/collection-'
ACTIVE = STATE / 'policai-collection-active.json'
DEADLINE = 0.0


class Refused(Exception):
    pass


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def save(run):
    atomic_json(Path(run['evidence']) / 'run.json', run)
    atomic_json(ACTIVE, run)


def interrupted(signum, _frame):
    raise Refused(f'interrupted by signal {signum}; retained for review')


def command(args, cwd=SOURCE, limit=45, log=None, check=True):
    remaining = min(limit, DEADLINE - time.monotonic())
    if remaining <= 0:
        raise subprocess.TimeoutExpired(args[0], limit)
    # Own process group: timeouts/signals stop npm and browser descendants too.
    with subprocess.Popen(args, cwd=cwd, stdout=log or subprocess.PIPE,
                          stderr=log or subprocess.PIPE, text=True,
                          start_new_session=True) as child:
        try:
            out, _err = child.communicate(timeout=remaining)
        except BaseException:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate()
            # Parent may exit before descendants; terminate any remaining group.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            raise
        if check and child.returncode:
            raise Refused(f'{args[0]} {args[1]} failed (exit {child.returncode}); retained for review')
        return (out or '').strip() if check else child.returncode


def git(*args, cwd=SOURCE):
    return command(['git', *args], cwd)


def digest(path):
    if path.is_symlink() or not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(run, phase):
    tree = Path(run['tree'])
    hashes = {}
    for name in [*ALLOWED, REGISTER]:
        source = tree / name
        hashes[name] = digest(source)
        if hashes[name] is not None:
            target = Path(run['evidence']) / phase / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    run[phase + '_hashes'] = hashes
    run['register_' + phase] = hashes[REGISTER]
    save(run)


def pending(tree=SOURCE):
    prs = json.loads(command(['gh', 'pr', 'list', '--repo', REPO, '--state', 'open',
                              '--limit', '1000', '--json', 'url,headRefName,headRefOid,baseRefName,createdAt,isCrossRepository'], tree))
    if len(prs) >= 1000:
        raise Refused('PR inventory truncated; manual review required')
    return [pr for pr in prs if pr['headRefName'].startswith(PREFIX)]


def state_only_proposal_enabled():
    value = os.environ.get('POLICAI_COLLECT_SUPERSEDE_STATE_ONLY', '0')
    if value not in ('0', '1'):
        raise Refused('POLICAI_COLLECT_SUPERSEDE_STATE_ONLY must be 0 or 1')
    return value == '1'


def state_only_pr(pr, tree=SOURCE):
    """Require local collector provenance and an exact, immutable Git diff.

    A branch name or PR description alone is not collector provenance. Missing
    receipts (including runs from other hosts) keep the ordinary review gate.
    """
    if (not pr['headRefName'].startswith(PREFIX) or pr['baseRefName'] != 'main'
            or pr.get('isCrossRepository') is not False):
        return False
    for path in (STATE / 'policai-collection-runs').glob('*/run.json'):
        if time.monotonic() >= DEADLINE:
            raise Refused('collector provenance inventory deadline exceeded')
        if path.is_symlink() or path.parent.is_symlink():
            continue
        try:
            receipt = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(receipt, dict):
            continue
        if (receipt.get('phase') != 'published' or receipt.get('pr') != pr['url']
                or receipt.get('branch') != pr['headRefName']
                or receipt.get('head') != pr['headRefOid']):
            continue
        before = receipt.get('register_before')
        base, head = receipt.get('base'), receipt.get('head')
        if (not isinstance(before, str) or not re.fullmatch(r'[0-9a-f]{64}', before)
                or before != receipt.get('register_after')
                or not all(isinstance(ref, str) and re.fullmatch(r'[0-9a-f]{40}', ref)
                           for ref in (base, head))):
            return False
        git('fetch', 'origin', 'refs/heads/' + pr['headRefName'], cwd=tree)
        if git('rev-parse', 'FETCH_HEAD', cwd=tree) != head:
            raise Refused('pending collection branch changed during inspection')
        if git('rev-list', '--count', base + '..' + head, cwd=tree) != '1':
            return False
        author = git('show', '-s', '--format=%an%n%ae', head, cwd=tree)
        if author != 'policai-collector[bot]\npolicai-collector[bot]@users.noreply.github.com':
            return False
        paths = set(git('diff', '--no-renames', '--name-only', '-z', base, head,
                        cwd=tree).split('\0')) - {''}
        return (bool(paths) and paths <= {'data/watch-state.json', 'public/data/meta.json'}
                and git('rev-parse', base + ':' + REGISTER, cwd=tree)
                == git('rev-parse', head + ':' + REGISTER, cwd=tree))
    return False


def assert_current_main(run):
    remote = git('ls-remote', '--exit-code', 'origin', 'refs/heads/main',
                 cwd=Path(run['tree'])).split()[0]
    if remote != run['base']:
        raise Refused('main advanced during collection; retained commit needs manual reconciliation')


def supersede_state_prs(run):
    """Close only inspected state PRs, after validation, keeping all evidence.

    Closure prevents an ordinary later approval from merging stale state over
    the replacement. Concurrent merges/head edits fail closed on read-back.
    """
    superseded = run.get('superseded_prs', [])
    if not superseded:
        return
    if not state_only_proposal_enabled():
        raise Refused('state-only supersession toggle is off; retained run needs review')
    tree = Path(run['tree'])
    planned = {pr['url']: pr for pr in superseded}
    # New editorial/feed PRs or previously closed PRs reopened after success
    # must not be swept into a supersession planned by an earlier invocation.
    for pr in pending(tree):
        if pr['headRefName'] == run['branch']:
            continue
        old = planned.get(pr['url'])
        if (not old or old['status'] == 'closed'
                or pr['headRefOid'] != old['headRefOid'] or not state_only_pr(pr, tree)):
            raise Refused('another or changed collection PR is pending; no supersession')
    assert_current_main(run)
    comment = (f"State-only supersession by collector run `{run['branch']}` from main `{run['base']}`. "
               'The new run passed structural validation with an unchanged curated register. '
               'All prior worktrees, receipts, snapshots and branches are retained. '
               'This PR is closed, not merged; do not reopen/merge it over the replacement. '
               'If publication fails or no new output exists, inspect the retained run receipt. '
               'Any later merge requires manual reconciliation, not an automatic retry.')
    for old in superseded:
        def read_back():
            return json.loads(command(['gh', 'pr', 'view', old['url'], '--repo', REPO,
                                       '--json', 'url,headRefName,headRefOid,baseRefName,state,isCrossRepository,comments'], tree))

        pr = read_back()
        if (pr['url'] != old['url'] or pr['headRefName'] != old['headRefName']
                or pr['headRefOid'] != old['headRefOid'] or pr['baseRefName'] != 'main'
                or pr.get('isCrossRepository') is not False or pr['state'] not in ('OPEN', 'CLOSED')):
            raise Refused('superseded PR changed or merged; manual reconciliation required')
        if pr['state'] == 'OPEN':
            if old['status'] == 'closed' or not state_only_pr(pr, tree):
                raise Refused('superseded PR reopened or no longer state-only; manual review required')
            args = ['gh', 'pr', 'close', old['url'], '--repo', REPO]
            if not any(item.get('body') == comment for item in pr.get('comments', [])):
                args.extend(['--comment', comment])
            command(args, tree)
            pr = read_back()
        if (pr['state'] != 'CLOSED' or pr['headRefOid'] != old['headRefOid']
                or pr['headRefName'] != old['headRefName'] or pr['baseRefName'] != 'main'
                or not any(item.get('body') == comment for item in pr.get('comments', []))):
            raise Refused('supersession close/comment read-back mismatch; retained for review')
        old['status'] = 'closed'
        save(run)
    assert_current_main(run)


def review_wait(prs):
    """A pending collection PR is a normal wait, not a failure, until it goes stale.

    Returns (exit_code, message). Within the grace period the skipped run exits 0
    so OnFailure alerts and topology drift stay reserved for real faults. After it,
    or when the PR age is unreadable, exit 1 so a forgotten review surfaces.
    """
    value = os.environ.get('POLICAI_COLLECT_REVIEW_GRACE_HOURS', '72')
    if not re.fullmatch(r'[0-9]+', value):
        raise Refused('review grace must be a non-negative whole number of hours')
    urls = ' '.join(pr['url'] for pr in prs)
    now = datetime.datetime.now(datetime.timezone.utc)
    ages = []
    for pr in prs:
        try:
            created = datetime.datetime.fromisoformat(pr['createdAt'].replace('Z', '+00:00'))
        except (KeyError, AttributeError, ValueError):
            return 1, f'collection PR awaiting review (age unreadable); no new run or overwrite: {urls}'
        ages.append((now - created).total_seconds() / 3600)
    oldest = max(ages)
    if oldest >= int(value):
        return 1, (f'collection PR awaiting review for {oldest:.0f}h (grace {value}h); '
                   f'no new run or overwrite: {urls}')
    return 0, f'skipped: collection PR awaiting review ({oldest:.0f}h old); no new run or overwrite: {urls}'


def assert_clean(tree):
    if git('status', '--porcelain=v1', '--untracked-files=all', cwd=tree):
        raise Refused('checkout has staged, unstaged or untracked files; nothing discarded')


def changed_paths(tree):
    # HEAD-to-worktree alone hides staged changes cancelled in the worktree.
    # Disable rename folding so both old and new paths meet the exact allowlist.
    paths = set()
    for args in [('diff', '--cached', '--no-renames', '--name-only', '-z', 'HEAD'),
                 ('diff', '--no-renames', '--name-only', '-z'),
                 ('ls-files', '--others', '--exclude-standard', '-z')]:
        paths.update(p for p in git(*args, cwd=tree).split('\0') if p)
    return paths


def output_gate(run):
    tree = Path(run['tree'])
    if not run.get('register_before') or digest(tree / REGISTER) != run['register_before']:
        raise Refused('curated register changed/missing; before and after retained, no restore')
    paths = changed_paths(tree)
    run['changed_paths'] = sorted(paths)
    save(run)
    if paths - set(ALLOWED):
        raise Refused('unexpected output paths; retained in run worktree, never staged for publication')
    if any(digest(tree / name) is None for name in ALLOWED):
        raise Refused('missing or symlink output; review required')


def verify_pr(run, url):
    tree = Path(run['tree'])
    pr = json.loads(command(['gh', 'pr', 'view', url, '--repo', REPO, '--json',
                             'url,headRefName,headRefOid,baseRefName,state,isDraft,body'], tree))
    if (pr['headRefOid'] != run['head'] or pr['headRefName'] != run['branch']
            or pr['baseRefName'] != 'main' or pr['state'] != 'OPEN'):
        raise Refused('PR read-back mismatch; manual review required')
    if run.get('superseded_prs'):
        if any(old['url'] not in pr.get('body', '') for old in run['superseded_prs']):
            raise Refused('PR supersession notice missing; manual review required')
        assert_current_main(run)
    run['pr'] = pr['url']
    run['phase'] = 'published'
    save(run)


def publish(run):
    tree = Path(run['tree'])
    branch = run['branch']
    if not branch.startswith(PREFIX) or branch == 'main':
        raise Refused('invalid collection branch')
    assert_clean(tree)
    if git('branch', '--show-current', cwd=tree) != branch or git('rev-parse', 'HEAD', cwd=tree) != run['head']:
        raise Refused('retained run HEAD changed')
    if digest(tree / REGISTER) != run['register_before']:
        raise Refused('retained register changed')
    outgoing = set(git('diff', '--name-only', '-z', run['base'], 'HEAD', cwd=tree).split('\0')) - {''}
    if not outgoing or outgoing - set(ALLOWED):
        raise Refused('outgoing commit paths outside explicit allowlist')
    if git('rev-list', '--count', run['base'] + '..HEAD', cwd=tree) != '1':
        raise Refused('unexpected outgoing commit history')
    supersede_state_prs(run)
    prs = pending(tree)
    if any(pr['headRefName'] != branch for pr in prs):
        raise Refused('another collection PR is pending; no accumulation')
    if prs:
        verify_pr(run, prs[0]['url'])
        return run['collection_exit']
    # Do not rebase JSON or silently replace newer editorial data.
    assert_current_main(run)
    remote = git('ls-remote', 'origin', 'refs/heads/' + branch, cwd=tree).split()
    if remote and remote[0] != run['head']:
        raise Refused('remote collection branch changed; never force or overwrite')
    if not remote:
        git('push', 'origin', f'HEAD:refs/heads/{branch}', cwd=tree)
    if git('ls-remote', '--exit-code', 'origin', 'refs/heads/' + branch, cwd=tree).split()[0] != run['head']:
        raise Refused('push read-back mismatch')
    supersession = ''
    if run.get('superseded_prs'):
        supersession = ('\n\nSupersedes state-only PR(s), closed without deleting evidence: '
                        + ' '.join(pr['url'] for pr in run['superseded_prs'])
                        + '. Do not reopen/merge these over this replacement; reconcile manually instead.')
    # Check again after push: a concurrent merge must not silently replace main.
    assert_current_main(run)
    url = command(['gh', 'pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch,
                   '--draft', '--title', 'chore(data): collection ' + run['started_at'][:10],
                   '--body', f"Collector exit: {run['collection_exit']}. Structural validation passed; curated register unchanged. "
                   'Coverage may be incomplete: review public/data/meta.json. Data publication and editorial approval are separate. '
                   'Required lint/test/build and independent review remain mandatory. No automatic merge.' + supersession], tree)
    verify_pr(run, url)
    return run['collection_exit']


def collect(run):
    tree = Path(run['tree'])
    snapshot(run, 'before')
    try:
        with (Path(run['evidence']) / 'install.log').open('w') as log:
            command(['npm', 'ci', '--no-audit', '--no-fund'], tree, limit=600, log=log)
        assert_clean(tree)
        with (Path(run['evidence']) / 'collect.log').open('w') as log:
            try:
                run['collection_exit'] = command(['npm', 'run', 'collect'], tree,
                                                  limit=3500, log=log, check=False)
            except subprocess.TimeoutExpired:
                run['collection_exit'] = 124
                raise
    finally:
        # Also executed for nonzero exits, timeouts and handled termination signals.
        snapshot(run, 'after')
    output_gate(run)
    with (Path(run['evidence']) / 'validate.log').open('w') as log:
        run['validation_exit'] = command(['npm', 'run', 'validate:data'], tree,
                                          limit=120, log=log, check=False)
    save(run)
    output_gate(run)
    if run['validation_exit']:
        raise Refused('data validation failed; retained, not published')
    if not run['changed_paths']:
        supersede_state_prs(run)
        run['phase'] = 'no-changes'
        save(run)
        return run['collection_exit']
    git('add', '--', *ALLOWED, cwd=tree)
    # Commit consumes the entire index, not merely the preceding add's paths.
    staged = set(git('diff', '--cached', '--no-renames', '--name-only', '-z',
                     'HEAD', cwd=tree).split('\0')) - {''}
    if not staged or staged - set(ALLOWED):
        raise Refused('staged output paths empty or outside explicit allowlist; index retained, no commit')
    git('-c', 'user.name=policai-collector[bot]',
        '-c', 'user.email=policai-collector[bot]@users.noreply.github.com',
        'commit', '-m', 'chore(data): daily collection ' + run['started_at'][:10], cwd=tree)
    run['head'] = git('rev-parse', 'HEAD', cwd=tree)
    run['phase'] = 'ready'
    save(run)
    return publish(run)


def retained_bytes():
    """Apparent inode sizes, all runs/evidence; never traverse symlinks."""
    total = 0
    for root in (RUNS, STATE / 'policai-collection-runs'):
        if root.resolve() != root:
            raise Refused('storage root alias; inventory unknown')
        try:
            root_info = root.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISDIR(root_info.st_mode):
            raise Refused('storage root is not a directory')
        stack = [root]
        while stack:
            if DEADLINE and time.monotonic() >= DEADLINE:
                raise Refused('storage inventory deadline exceeded')
            path = stack.pop()
            info = path.lstat()
            if info.st_dev != root_info.st_dev or info.st_uid != os.getuid():
                raise Refused('storage inventory device/owner boundary')
            if stat.S_ISDIR(info.st_mode):
                if path.is_mount():
                    raise Refused('storage inventory mount boundary')
                stack.extend(path.iterdir())
            elif not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
                raise Refused('storage inventory special file')
            total += info.st_size
    return total


def storage_status():
    value = os.environ.get('POLICAI_COLLECT_CAP_BYTES', str(10 * 1024**3))
    if not re.fullmatch(r'[0-9]+', value) or int(value) <= 0:
        raise Refused('storage cap must be a positive decimal byte count')
    cap = int(value)
    used = retained_bytes()
    headroom = 1024**3
    return dict(apparent_bytes=used, cap_bytes=cap, headroom_bytes=headroom,
                admitted=used + headroom < cap, automatic_cleanup=False)


def admission_guard():
    status = storage_status()
    if not status['admitted']:
        raise Refused('storage admission refused: retained bytes plus one GiB headroom '
                      'reach cap; all evidence retained; manual cleanup review required')


def main():
    global DEADLINE
    os.umask(0o077)
    if sys.argv[1:] == ['--storage-status']:
        DEADLINE = time.monotonic() + 120
        try:
            # Existing lock only: status never creates or rewrites runtime files.
            with (STATE / 'policai-collect.lock').open('r') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                print(json.dumps(storage_status(), indent=2))
            return 0
        except BlockingIOError:
            return 75
        except (OSError, ValueError, Refused) as exc:
            print(str(exc), file=sys.stderr)
            return 1
    if sys.argv[1:] not in ([], ['--preflight'], ['--retry-publication']):
        print('Usage: policai-collect.sh [--preflight|--retry-publication|--storage-status]', file=sys.stderr)
        return 2
    DEADLINE = time.monotonic() + min(3500, max(1, int(os.environ.get('POLICAI_COLLECT_MAX_SECONDS', '3500'))))
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / 'policai-collect.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('collector already running', file=sys.stderr)
            return 75
        run = None
        rc = 1
        message = ''
        skipped = None
        try:
            if os.environ.get('POLICAI_COLLECT_BRANCH', 'main') != 'main':
                raise Refused('branch override retired; collection base must be main')
            # Preserve heuristic mode; never read cloud credentials or opt into AI.
            if os.environ.get('USE_CLAUDE_CLASSIFIER'):
                raise Refused('AI classifier requires separately reviewed configuration')
            os.environ['FIRECRAWL_URL'] = 'http://127.0.0.1:3003'
            os.environ['NODE_EXTRA_CA_CERTS'] = str(HOME / '.local/share/policai/geotrust-tls-rsa-ca-g1.pem')
            assert_clean(SOURCE)
            if sys.argv[1:] == ['--preflight']:
                git('ls-remote', '--exit-code', 'origin', 'refs/heads/main')
                if not (SOURCE / 'package-lock.json').is_file() or not Path(os.environ['NODE_EXTRA_CA_CERTS']).is_file():
                    raise Refused('lockfile or CA missing')
                pending()
                print('Preflight passed: clean source, remote and GitHub readable, lockfile and CA present; no collection/publication.')
                return 0
            previous = json.loads(ACTIVE.read_text()) if ACTIVE.exists() else None
            if sys.argv[1:] == ['--retry-publication']:
                if not previous or previous['phase'] not in ('ready', 'published'):
                    raise Refused('no validated commit available for publication retry')
                run = previous
                rc = publish(run)
            else:
                admission_guard()
                if previous and previous['phase'] not in ('published', 'no-changes'):
                    raise Refused('previous incomplete run retained; review active receipt before another collection')
                waiting = pending()
                supersede = state_only_proposal_enabled() and waiting and all(state_only_pr(pr) for pr in waiting)
                if waiting and not supersede:
                    skipped = 'awaiting-review'
                    rc, message = review_wait(waiting)
                    return rc
                git('fetch', 'origin', 'main')
                base = git('rev-parse', 'refs/remotes/origin/main')
                run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
                tree = RUNS / run_id
                evidence = STATE / 'policai-collection-runs' / run_id
                RUNS.mkdir(parents=True, exist_ok=True)
                evidence.mkdir(parents=True)
                run = dict(started_at=utc(), tree=str(tree), evidence=str(evidence), base=base,
                           branch=PREFIX + run_id, phase='collecting', collection_exit=None)
                if supersede:
                    run['superseded_prs'] = [dict(url=pr['url'], headRefName=pr['headRefName'],
                                                 headRefOid=pr['headRefOid'], status='planned')
                                            for pr in waiting]
                save(run)
                git('worktree', 'add', '-b', run['branch'], str(tree), base)
                rc = collect(run)
        except subprocess.TimeoutExpired:
            rc, message = 124, 'deadline exceeded; outputs retained, no automatic publication'
        except (Refused, OSError, ValueError, KeyError) as exc:
            rc, message = 1, str(exc)
        finally:
            receipt = dict(finished_at=utc(), exit_code=rc, message=message)
            if skipped:
                receipt['skipped'] = skipped
            if run:
                run.update(receipt)
                save(run)
                receipt = run
            if sys.argv[1:] != ['--preflight']:
                atomic_json(STATE / 'policai-collect.json', receipt)
            if message:
                print(message, file=sys.stderr)
            if run:
                print('Evidence:', run['evidence'])
                if run.get('pr'):
                    print('Review PR:', run['pr'])
        return rc


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    sys.exit(main())
