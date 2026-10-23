#!/usr/bin/env python3
"""Policai collector entry point: historical .sh name, Python 3 stdlib only.

One run: reset the reusable worktree to a freshly fetched main, collect with
the collector's host state, validate, promote that state, then open a
collection PR (ready, so repo auto-merge takes it) and close older ones. A
failed run records its evidence and exits nonzero for the alert; it never
blocks the next run, because the outbox replays anything main lacks.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import uuid

HOME = Path.home()
SOURCE = HOME / 'Work/Argus/live/policai-collector'
WORK = HOME / 'Work/Argus/src/policai-collector-work'
STATE = HOME / '.local/state/argus-jobs'
COLLECTOR_STATE = STATE / 'policai-collector'
RUNS = STATE / 'policai-collection-runs'
ALLOWED = ['data/developments.json', 'public/data/meta.json',
           'data/watch-state.json', 'data/source-reviews.json']
REGISTER = 'data/policies.json'
HOST_STATE = ['watch-state.json', 'outbox.json']
REPO = 'l0cka/policai'
PREFIX = 'automation/collection-'
EVIDENCE_DAYS = 30
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


def interrupted(signum, _frame):
    raise Refused(f'interrupted by signal {signum}; host state not promoted')


def command(args, cwd=SOURCE, limit=45, log=None, check=True, env=None):
    remaining = min(limit, DEADLINE - time.monotonic())
    if remaining <= 0:
        raise subprocess.TimeoutExpired(args[0], limit)
    # Own process group: timeouts/signals stop npm and browser descendants too.
    with subprocess.Popen(args, cwd=cwd, stdout=log or subprocess.PIPE,
                          stderr=log or subprocess.PIPE, text=True,
                          start_new_session=True, env=env) as child:
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
            raise Refused(f'{args[0]} {args[1]} failed (exit {child.returncode})')
        return (out or '').strip() if check else child.returncode


def git(*args, cwd=SOURCE):
    return command(['git', *args], cwd)


def digest(path):
    if path.is_symlink() or not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(run, phase):
    hashes = {}
    for name in [*ALLOWED, REGISTER]:
        source = WORK / name
        hashes[name] = digest(source)
        if hashes[name] is not None:
            target = Path(run['evidence']) / phase / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    run['register_' + phase] = hashes[REGISTER]
    save(run)


def assert_clean(tree):
    if git('status', '--porcelain=v1', '--untracked-files=all', cwd=tree):
        raise Refused(f'{tree} has staged, unstaged or untracked files; nothing discarded')


def changed_paths():
    # HEAD-to-worktree alone hides staged changes cancelled in the worktree.
    # Disable rename folding so both old and new paths meet the exact allowlist.
    paths = set()
    for args in [('diff', '--cached', '--no-renames', '--name-only', '-z', 'HEAD'),
                 ('diff', '--no-renames', '--name-only', '-z'),
                 ('ls-files', '--others', '--exclude-standard', '-z')]:
        paths.update(p for p in git(*args, cwd=WORK).split('\0') if p)
    return paths


def output_gate(run):
    if not run.get('register_before') or digest(WORK / REGISTER) != run['register_before']:
        raise Refused('curated register changed/missing; nothing published, state not promoted')
    paths = changed_paths()
    run['changed_paths'] = sorted(paths)
    save(run)
    if paths - set(ALLOWED):
        raise Refused('unexpected output paths; never staged for publication')
    if any(digest(WORK / name) is None for name in ALLOWED):
        raise Refused('missing or symlink output')


def prepare(run):
    """Reset the one reusable worktree to fresh main; reinstall only on a new lockfile."""
    git('fetch', 'origin', 'main')
    run['base'] = git('rev-parse', 'refs/remotes/origin/main')
    git('worktree', 'prune')
    if not WORK.exists():
        WORK.parent.mkdir(parents=True, exist_ok=True)
        git('worktree', 'add', '--detach', str(WORK), run['base'])
    git('checkout', '--detach', '--force', run['base'], cwd=WORK)
    git('clean', '-ffdx', '-e', 'node_modules', cwd=WORK)
    for branch in git('for-each-ref', '--format=%(refname:short)', 'refs/heads/automation/').split():
        # A branch still checked out by a retired per-run worktree stays.
        if branch.startswith(PREFIX):
            command(['git', 'branch', '-D', branch], SOURCE, check=False)
    assert_clean(WORK)
    save(run)
    marker = COLLECTOR_STATE / 'installed-lock.sha256'
    lock = digest(WORK / 'package-lock.json')
    if not (WORK / 'node_modules').is_dir() or not marker.is_file() or marker.read_text().strip() != lock:
        with (Path(run['evidence']) / 'install.log').open('w') as log:
            command(['npm', 'ci', '--no-audit', '--no-fund'], WORK, limit=600, log=log)
        marker.write_text(f'{lock}\n')
    assert_clean(WORK)


def promote_host_state():
    """The run's state and outbox become the collector's memory, only after validation."""
    staged = COLLECTOR_STATE / 'next'
    for name in HOST_STATE:
        if (staged / name).is_file():
            (staged / name).replace(COLLECTOR_STATE / name)
    shutil.rmtree(staged, ignore_errors=True)


def collect(run):
    shutil.rmtree(COLLECTOR_STATE / 'next', ignore_errors=True)
    snapshot(run, 'before')
    env = dict(os.environ, POLICAI_COLLECTOR_STATE=str(COLLECTOR_STATE))
    try:
        with (Path(run['evidence']) / 'collect.log').open('w') as log:
            try:
                run['collection_exit'] = command(['npm', 'run', 'collect'], WORK, limit=3500,
                                                  log=log, check=False, env=env)
            except subprocess.TimeoutExpired:
                run['collection_exit'] = 124
                raise
    finally:
        # Also executed for nonzero exits, timeouts and handled termination signals.
        snapshot(run, 'after')
    output_gate(run)
    with (Path(run['evidence']) / 'validate.log').open('w') as log:
        run['validation_exit'] = command(['npm', 'run', 'validate:data'], WORK,
                                          limit=120, log=log, check=False)
    save(run)
    output_gate(run)
    if run['validation_exit']:
        raise Refused('data validation failed; state not promoted, nothing published')
    promote_host_state()
    run['phase'] = 'validated'
    save(run)
    if not run['changed_paths']:
        run['phase'] = 'no-changes'
        save(run)
        return run['collection_exit']
    git('checkout', '-b', run['branch'], cwd=WORK)
    git('add', '--', *ALLOWED, cwd=WORK)
    # Commit consumes the entire index, not merely the preceding add's paths.
    staged = set(git('diff', '--cached', '--no-renames', '--name-only', '-z',
                     'HEAD', cwd=WORK).split('\0')) - {''}
    if not staged or staged - set(ALLOWED):
        raise Refused('staged output paths empty or outside explicit allowlist; no commit')
    git('-c', 'user.name=policai-collector[bot]',
        '-c', 'user.email=policai-collector[bot]@users.noreply.github.com',
        'commit', '-m', 'chore(data): daily collection ' + run['started_at'][:10], cwd=WORK)
    run['head'] = git('rev-parse', 'HEAD', cwd=WORK)
    save(run)
    return publish(run)


def publish(run):
    git('push', 'origin', f'HEAD:refs/heads/{run["branch"]}', cwd=WORK)
    url = command(['gh', 'pr', 'create', '--repo', REPO, '--base', 'main', '--head', run['branch'],
                   '--title', 'chore(data): collection ' + run['started_at'][:10],
                   '--body', f"Collector exit: {run['collection_exit']}. Structural validation passed; "
                   'curated register unchanged. Coverage may be incomplete: see public/data/meta.json. '
                   'Detections show as needs review; editorial approval is per item. '
                   'Auto-merges when the required checks pass.'], WORK)
    run['pr'] = url
    run['phase'] = 'published'
    save(run)
    close_older_prs(run)
    return run['collection_exit']


def close_older_prs(run):
    """This PR carries the outbox, so every older collection PR is redundant."""
    prs = json.loads(command(['gh', 'pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '100',
                              '--json', 'url,headRefName'], WORK))
    for pr in prs:
        if pr['headRefName'].startswith(PREFIX) and pr['url'] != run['pr']:
            command(['gh', 'pr', 'close', pr['url'], '--repo', REPO, '--comment',
                     f"Superseded by {run['pr']}, which replays every finding main lacks."], WORK)


def prune_evidence():
    cutoff = time.time() - EVIDENCE_DAYS * 86400
    for evidence in RUNS.iterdir() if RUNS.is_dir() else []:
        if evidence.is_dir() and not evidence.is_symlink() and evidence.stat().st_mtime < cutoff:
            shutil.rmtree(evidence)


def check_environment():
    if os.environ.get('POLICAI_COLLECT_BRANCH', 'main') != 'main':
        raise Refused('branch override retired; collection base must be main')
    # Model relevance stays on this machine: the retired cloud classifier
    # and its credentials refuse; USE_CLEF_CLASSIFIER=1 opts into local Clef.
    if any(os.environ.get(name) for name in ('USE_CLAUDE_CLASSIFIER', 'CLASSIFIER_BASE_URL', 'CLASSIFIER_API_KEY')):
        raise Refused('cloud classifier retired; only local Clef (USE_CLEF_CLASSIFIER=1) is allowed')
    # Unset keeps the keyword rules; only an explicit 1 turns Clef on.
    if os.environ.get('USE_CLEF_CLASSIFIER') not in (None, '1'):
        raise Refused('USE_CLEF_CLASSIFIER must be unset or 1')
    os.environ['FIRECRAWL_URL'] = 'http://127.0.0.1:3003'
    os.environ['NODE_EXTRA_CA_CERTS'] = str(HOME / '.local/share/policai/geotrust-tls-rsa-ca-g1.pem')


def main():
    global DEADLINE
    os.umask(0o077)
    if sys.argv[1:] not in ([], ['--preflight']):
        print('Usage: policai-collect.sh [--preflight]', file=sys.stderr)
        return 2
    budget = min(3500, max(1, int(os.environ.get('POLICAI_COLLECT_MAX_SECONDS', '3500'))))
    DEADLINE = time.monotonic() + budget
    COLLECTOR_STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / 'policai-collect.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('collector already running', file=sys.stderr)
            return 75
        run = None
        rc = 1
        message = ''
        try:
            check_environment()
            if sys.argv[1:] == ['--preflight']:
                git('ls-remote', '--exit-code', 'origin', 'refs/heads/main')
                command(['gh', 'pr', 'list', '--repo', REPO, '--limit', '1', '--json', 'url'])
                if not (SOURCE / 'package-lock.json').is_file() or not Path(os.environ['NODE_EXTRA_CA_CERTS']).is_file():
                    raise Refused('lockfile or CA missing')
                print('Preflight passed: remote and GitHub readable, lockfile and CA present; '
                      'no collection/publication.')
                return 0
            prune_evidence()
            run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
            evidence = RUNS / run_id
            evidence.mkdir(parents=True)
            run = dict(run_id=run_id, started_at=utc(), evidence=str(evidence),
                       branch=PREFIX + run_id, phase='collecting', collection_exit=None)
            save(run)
            prepare(run)
            rc = collect(run)
        except subprocess.TimeoutExpired:
            rc, message = 124, 'deadline exceeded; state not promoted, nothing published'
        except (Refused, OSError, ValueError, KeyError) as exc:
            rc, message = 1, str(exc)
        finally:
            receipt = dict(finished_at=utc(), exit_code=rc, message=message)
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
                    print('PR:', run['pr'])
        return rc


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    sys.exit(main())
