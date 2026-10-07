#!/usr/bin/env python3
"""Policai collector entry point: historical .sh name, Python 3 stdlib only.

Never collect in main or a serving checkout. Retain every run until reviewed;
only node_modules of merged/closed published runs a week old may be pruned, by
explicit opt-in, through descriptors anchored at / (no absolute-path deletion).
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
                              '--limit', '1000', '--json', 'url,headRefName,headRefOid,baseRefName,createdAt,isCrossRepository,isDraft,reviewDecision,reviews'], tree))
    if len(prs) >= 1000:
        raise Refused('PR inventory truncated; manual review required')
    return [pr for pr in prs if pr['headRefName'].startswith(PREFIX)]


def state_only_proposal_enabled():
    value = os.environ.get('POLICAI_COLLECT_SUPERSEDE_STATE_ONLY', '0')
    if value not in ('0', '1'):
        raise Refused('POLICAI_COLLECT_SUPERSEDE_STATE_ONLY must be 0 or 1')
    return value == '1'


def unreviewed_draft(pr):
    return (pr.get('isDraft') is True
            and pr.get('reviewDecision') in ('', 'REVIEW_REQUIRED')
            and pr.get('reviews') == [])


def state_only_pr(pr, tree=SOURCE):
    """Require local collector provenance and an exact, immutable Git diff.

    A branch name or PR description alone is not collector provenance. Missing
    receipts (including runs from other hosts) keep the ordinary review gate.
    """
    if (not pr['headRefName'].startswith(PREFIX) or pr['baseRefName'] != 'main'
            or pr.get('isCrossRepository') is not False or not unreviewed_draft(pr)):
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
        git('fetch', 'origin', 'main', cwd=tree)
        git('fetch', 'origin', 'refs/heads/' + pr['headRefName'], cwd=tree)
        if git('rev-parse', 'FETCH_HEAD', cwd=tree) != head:
            raise Refused('pending collection branch changed during inspection')
        ancestry = command(['git', 'merge-base', '--is-ancestor', base, 'origin/main'],
                           tree, check=False)
        if ancestry == 1:
            return False
        if ancestry:
            raise Refused('cannot verify receipt base ancestry')
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


def check_supersession_inventory(run):
    """Revalidate the planned old PRs without changing any remote state."""
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


def supersede_state_prs(run):
    """Close inspected state PRs only after verifying their published replacement."""
    superseded = run.get('superseded_prs', [])
    if not superseded:
        return
    if not run.get('pr') or run['phase'] not in ('superseding', 'published'):
        raise Refused('no verified replacement available for supersession')
    check_supersession_inventory(run)
    tree = Path(run['tree'])
    comment = (f"State-only supersession by verified replacement {run['pr']} "
               f"(collector run `{run['branch']}` from main `{run['base']}`). "
               'The new run passed structural validation with an unchanged curated register. '
               'All prior worktrees, receipts, snapshots and branches are retained. '
               'This PR is closed, not merged; do not reopen/merge it over the replacement. '
               'Any later merge requires manual reconciliation, not an automatic retry.')
    for old in superseded:
        def read_back():
            return json.loads(command(['gh', 'pr', 'view', old['url'], '--repo', REPO,
                                       '--json', 'url,headRefName,headRefOid,baseRefName,state,isCrossRepository,comments,isDraft,reviewDecision,reviews'], tree))

        pr = read_back()
        if (pr['url'] != old['url'] or pr['headRefName'] != old['headRefName']
                or pr['headRefOid'] != old['headRefOid'] or pr['baseRefName'] != 'main'
                or pr.get('isCrossRepository') is not False or pr['state'] not in ('OPEN', 'CLOSED')
                or not unreviewed_draft(pr)):
            raise Refused('superseded PR changed or merged; manual reconciliation required')
        if pr['state'] == 'OPEN':
            if old['status'] == 'closed' or not state_only_pr(pr, tree):
                raise Refused('superseded PR reopened or no longer state-only; manual review required')
            # Git/receipt inspection can take time. Read mutable review state
            # again immediately before close, not just at initial eligibility.
            pr = read_back()
            if (pr['url'] != old['url'] or pr['state'] != 'OPEN'
                    or pr['headRefOid'] != old['headRefOid']
                    or pr['headRefName'] != old['headRefName'] or pr['baseRefName'] != 'main'
                    or pr.get('isCrossRepository') is not False or not unreviewed_draft(pr)):
                raise Refused('superseded PR changed or reviewed before close; manual review required')
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
        if pr.get('isDraft') is not True:
            raise Refused('replacement PR is no longer a draft; manual review required')
        urls = {token.rstrip('.,;:!?') for token in
                re.findall(r'https?://[^\s<>]+', pr.get('body', ''))}
        if any(old['url'] not in urls for old in run['superseded_prs']):
            raise Refused('PR supersession notice missing; manual review required')
        assert_current_main(run)
    run['pr'] = pr['url']
    # A failed recheck must not turn completed publication into a timer blocker.
    if run['phase'] != 'published':
        run['phase'] = 'superseding' if run.get('superseded_prs') else 'published'
    save(run)


def finish_publication(run, url):
    verify_pr(run, url)
    supersede_state_prs(run)
    run['phase'] = 'published'
    save(run)
    return run['collection_exit']


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
    check_supersession_inventory(run)
    prs = pending(tree)
    planned = {pr['url'] for pr in run.get('superseded_prs', [])}
    if any(pr['headRefName'] != branch and pr['url'] not in planned for pr in prs):
        raise Refused('another collection PR is pending; no accumulation')
    if run.get('superseded_prs') and run.get('pr'):
        return finish_publication(run, run['pr'])
    replacement = [pr for pr in prs if pr['headRefName'] == branch]
    if replacement:
        return finish_publication(run, replacement[0]['url'])
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
        supersession = ('\n\nSupersedes state-only PR(s); closure follows verified publication, without deleting evidence: '
                        + ' '.join(pr['url'] for pr in run['superseded_prs'])
                        + '. Do not reopen/merge these over this replacement; reconcile manually instead.')
    # Only supersession adds a post-push guard; preserve the default PR flow.
    if run.get('superseded_prs'):
        assert_current_main(run)
    url = command(['gh', 'pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch,
                   '--draft', '--title', 'chore(data): collection ' + run['started_at'][:10],
                   '--body', f"Collector exit: {run['collection_exit']}. Structural validation passed; curated register unchanged. "
                   'Coverage may be incomplete: review public/data/meta.json. Data publication and editorial approval are separate. '
                   'Required lint/test/build and independent review remain mandatory. No automatic merge.' + supersession], tree)
    return finish_publication(run, url)


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


RUN_ID = re.compile(r'\d{8}T\d{6}Z-[0-9a-f]{8}')
PROC = Path('/proc')
MOUNTINFO = Path('/proc/self/mountinfo')
FDINFO = Path('/proc/self/fdinfo')
TERMINAL_PR = ('MERGED', 'CLOSED')
MIN_RETENTION_DAYS = 7
# Scheduled retention runs before, never inside, the 3500 s collection budget:
# 60 + 3500 s stays within the one-hour service timeout.
SCHEDULED_RETENTION_SECONDS = 60
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def decimal_env(name, default):
    value = os.environ.get(name, default)
    if not re.fullmatch(r'[0-9]+', value):
        raise Refused(f'{name} must be a non-negative whole number')
    return int(value)


def retention_days():
    days = decimal_env('POLICAI_COLLECT_RETENTION_DAYS', str(MIN_RETENTION_DAYS))
    if days < MIN_RETENTION_DAYS:
        raise Refused(f'POLICAI_COLLECT_RETENTION_DAYS must be at least {MIN_RETENTION_DAYS}')
    return days


def retention_seconds():
    """Scheduled retention budget; the setting can shorten, never extend, it."""
    value = decimal_env('POLICAI_COLLECT_RETENTION_SECONDS', str(SCHEDULED_RETENTION_SECONDS))
    return min(SCHEDULED_RETENTION_SECONDS, max(1, value))


def prune_enabled():
    value = os.environ.get('POLICAI_COLLECT_PRUNE_DEPENDENCIES', '0')
    if value not in ('0', '1'):
        raise Refused('POLICAI_COLLECT_PRUNE_DEPENDENCIES must be 0 or 1')
    return value == '1'


def owned_dir(path):
    """A real directory we own, reached without any symlink component."""
    if path != path.absolute() or path.resolve() != path:
        raise Refused('symlink or path alias')
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise Refused('not an owned directory')
    return info


def identity(info):
    return [info.st_dev, info.st_ino]


def open_dir(path):
    """Open an absolute directory one component at a time from /, never following a symlink.

    Every later check and removal works relative to the returned descriptor, so
    replacing any path component afterwards cannot redirect it.
    """
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise Refused('directory path is not absolute and normal')
    fd = os.open('/', DIR_FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
    except BaseException:
        os.close(fd)
        raise
    return fd


def mount_id(fd):
    """Kernel mount id of a descriptor; a bind mount differs even on the same device."""
    try:
        text = (FDINFO / str(fd)).read_text()
    except OSError:
        raise Refused('descriptor mount identity unreadable') from None
    match = re.search(r'^mnt_id:\s*([0-9]+)$', text, re.M)
    if not match:
        raise Refused('descriptor mount identity unparseable')
    return int(match.group(1))


def unescape_mount_path(field):
    return re.sub(rb'\\([0-3][0-7]{2})', lambda m: bytes([int(m.group(1), 8)]), field)


def mount_inside(path):
    """Refuse if any mount point, including a same-device bind mount, is at or under path.

    Device numbers and Path.is_mount cannot see a bind mount of a directory on the
    same filesystem; the mount table can. An unreadable or unparseable table refuses.
    """
    try:
        lines = MOUNTINFO.read_bytes().splitlines()
    except OSError:
        raise Refused('mount table unreadable') from None
    if not lines:
        raise Refused('mount table empty')
    prefix = os.fsencode(str(path))
    for line in lines:
        fields = line.split(b' ')
        if len(fields) < 10 or b'-' not in fields[6:] or not fields[4].startswith(b'/'):
            raise Refused('mount table unparseable')
        point = unescape_mount_path(fields[4])
        if point == prefix or point.startswith(prefix + b'/'):
            raise Refused('mount at or under the run tree')


def walk_dependencies(root_fd, remove=False):
    """Apparent size of the directory held by root_fd, optionally removing its contents.

    Descriptor-relative throughout: each subdirectory is opened with O_NOFOLLOW,
    must be the entry just inspected, on the same device and mount, and owned by
    us. Symlinks are unlinked, never followed. Special files refuse. The caller
    removes the (then empty) root itself.
    """
    root = os.fstat(root_fd)
    root_mount = mount_id(root_fd)
    total = root.st_size
    with os.scandir(root_fd) as entries:
        names = [entry.name for entry in entries]
    stack = [(root_fd, names, None)]
    try:
        while stack:
            fd, names, link = stack[-1]
            if not names:
                stack.pop()
                if link:
                    os.close(fd)
                if link and remove:
                    parent_fd, name, info = link
                    again = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                    if not os.path.samestat(again, info):
                        raise Refused('dependency directory replaced during removal')
                    os.rmdir(name, dir_fd=parent_fd)
                continue
            if time.monotonic() >= DEADLINE:
                raise Refused('dependency walk deadline exceeded')
            name = names.pop()
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if info.st_dev != root.st_dev or info.st_uid != os.getuid():
                raise Refused('dependency device/owner boundary')
            total += info.st_size
            if stat.S_ISDIR(info.st_mode):
                child = os.open(name, DIR_FLAGS, dir_fd=fd)
                try:
                    if not os.path.samestat(os.fstat(child), info):
                        raise Refused('dependency directory replaced during inspection')
                    if mount_id(child) != root_mount:
                        raise Refused('mount inside dependencies')
                    with os.scandir(child) as entries:
                        children = [entry.name for entry in entries]
                except BaseException:
                    os.close(child)
                    raise
                stack.append((child, children, (fd, name, info)))
            elif stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
                if remove:
                    os.unlink(name, dir_fd=fd)
            else:
                raise Refused('special file in dependencies')
    finally:
        for fd, _names, link in stack:
            if link:
                os.close(fd)
    return total


def tree_in_use(tree):
    """Best-effort Linux scan. Returns (referenced, incompletely_inspected_process_count).

    Each link is judged as soon as it is read, so a positive hit (cwd, root, exe,
    open descriptor or argument inside the tree) keeps the run even if another
    field of the same process cannot be read. A process whose inspection was
    incomplete (denied, or a descriptor vanished mid-scan) is counted and
    reported, not treated as proof of inactivity; see the README.
    """
    prefix = str(tree)
    needle = prefix.encode()
    incomplete = 0
    me = str(os.getpid())  # the wrapper holds descriptors on the tree it assesses
    for pid in PROC.iterdir():
        if time.monotonic() >= DEADLINE:
            raise Refused('process scan deadline exceeded')
        if not pid.name.isdecimal() or pid.name == me:
            continue
        partial = False
        links = [pid / name for name in ('cwd', 'root', 'exe')]
        try:
            links.extend(sorted((pid / 'fd').iterdir()))
        except OSError:
            partial = True
        for link in links:
            try:
                target = os.readlink(link)
            except OSError:
                partial = True  # this field only; keep checking the others
                continue
            if target == prefix or target.startswith(prefix + '/'):
                return True, incomplete
        try:
            if needle in (pid / 'cmdline').read_bytes():
                return True, incomplete
        except OSError:
            partial = True
        # A vanished /proc entry is a process that exited during the scan.
        if partial and pid.exists():
            incomplete += 1
    return False, incomplete


def active_run_id():
    """The active run's id, or None only when the pointer genuinely does not exist.

    A symlink (dangling or not), non-regular file, unparseable content or a
    receipt identity that does not match the wrapper's layout keeps every run.
    """
    try:
        info = os.lstat(ACTIVE)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode):
        raise Refused('active pointer is not a regular file; every run retained')
    try:
        fd = os.open(ACTIVE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
        with os.fdopen(fd) as handle:
            if not os.path.samestat(os.fstat(handle.fileno()), info):
                raise Refused('active pointer changed while reading; every run retained')
            active = json.loads(handle.read())
    except (OSError, ValueError):
        raise Refused('active pointer unreadable; every run retained') from None
    if not isinstance(active, dict) or not isinstance(active.get('evidence'), str):
        raise Refused('active pointer unreadable; every run retained')
    run_id = Path(active['evidence']).name
    if (not RUN_ID.fullmatch(run_id)
            or active['evidence'] != str(STATE / 'policai-collection-runs' / run_id)
            or active.get('tree') != str(RUNS / run_id)
            or active.get('branch') != PREFIX + run_id):
        raise Refused('active pointer identity invalid; every run retained')
    return run_id


def assess_run(evidence, open_branches, active_id, days):
    """Return (reason_to_keep or None, dependency bytes, incomplete processes, identities)."""
    run_id = evidence.name
    if not RUN_ID.fullmatch(run_id):
        return 'not a run directory', 0, 0, None
    owned_dir(evidence)
    receipt_path = evidence / 'run.json'
    if receipt_path.is_symlink() or not receipt_path.is_file():
        return 'receipt missing or not a regular file', 0, 0, None
    run = json.loads(receipt_path.read_text())
    tree = RUNS / run_id
    if (not isinstance(run, dict) or run.get('tree') != str(tree)
            or run.get('evidence') != str(evidence) or run.get('branch') != PREFIX + run_id):
        return 'receipt identity does not match its path', 0, 0, None
    if run_id == active_id:
        return 'active run pointer references it', 0, 0, None
    if run.get('phase') != 'published' or not isinstance(run.get('pr'), str):
        return f"phase {run.get('phase')!r}: only published runs are pruned", 0, 0, None
    if run['branch'] in open_branches:
        return 'collection PR is open', 0, 0, None
    finished = datetime.datetime.fromisoformat(run.get('finished_at') or '')
    age = (datetime.datetime.now(datetime.timezone.utc) - finished).total_seconds()
    if age < days * 86400:
        return f'finished less than {days} day(s) ago', 0, 0, None
    # lexists: a dangling marker symlink is still a marker.
    if os.path.lexists(evidence / 'retention-pruned.json'):
        return 'already pruned', 0, 0, None
    if os.path.lexists(evidence / 'retention-intent.json'):
        return 'earlier prune interrupted; manual review', 0, 0, None
    tree_fd = open_dir(tree)
    try:
        tree_info = os.fstat(tree_fd)
        if not stat.S_ISDIR(tree_info.st_mode) or tree_info.st_uid != os.getuid():
            raise Refused('run tree is not an owned directory')
        try:
            deps_info = os.stat('node_modules', dir_fd=tree_fd, follow_symlinks=False)
        except FileNotFoundError:
            return 'no dependencies present', 0, 0, None
        if not stat.S_ISDIR(deps_info.st_mode):
            return 'node_modules is not a real directory', 0, 0, None
        if git('--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all', cwd=tree):
            return 'worktree has staged, unstaged or untracked files', 0, 0, None
        if (git('branch', '--show-current', cwd=tree) != run['branch']
                or git('rev-parse', 'HEAD', cwd=tree) != run.get('head')):
            return 'worktree branch or HEAD differs from receipt', 0, 0, None
        if git('ls-files', '--', 'node_modules', cwd=tree):
            return 'tracked files under node_modules', 0, 0, None
        registered = git('worktree', 'list', '--porcelain').split('\n\n')
        if not any(('worktree ' + str(tree)) in r.splitlines()
                   and ('branch refs/heads/' + run['branch']) in r.splitlines() for r in registered):
            return 'not a registered collector worktree', 0, 0, None
        pr = json.loads(command(['gh', 'pr', 'view', run['pr'], '--repo', REPO, '--json',
                                 'url,state,headRefName,headRefOid,baseRefName'], tree))
        if (pr['url'] != run['pr'] or pr['state'] not in TERMINAL_PR
                or pr['headRefName'] != run['branch'] or pr['headRefOid'] != run.get('head')
                or pr['baseRefName'] != 'main'):
            return f"PR is {pr['state']} or differs from receipt", 0, 0, None
        mount_inside(tree)
        deps_fd = os.open('node_modules', DIR_FLAGS, dir_fd=tree_fd)
        try:
            deps_now = os.fstat(deps_fd)
            if (not os.path.samestat(deps_now, deps_info) or deps_now.st_uid != os.getuid()
                    or deps_now.st_dev != tree_info.st_dev
                    or mount_id(deps_fd) != mount_id(tree_fd)):
                raise Refused('dependency directory replaced, foreign or mounted')
            size = walk_dependencies(deps_fd)
        finally:
            os.close(deps_fd)
        used, incomplete = tree_in_use(tree)
        if used:
            return 'a process references the run tree', size, incomplete, None
        held = dict(tree=identity(tree_info), deps=identity(deps_info))
        anchored(tree, held).close()  # the path still names the assessed directories
        return None, size, incomplete, held
    finally:
        os.close(tree_fd)


class anchored:
    """Re-open the run tree from / and require the identities assessment saw."""

    def __init__(self, tree, held):
        self.tree_fd = open_dir(tree)
        self.deps_fd = None
        try:
            if identity(os.fstat(self.tree_fd)) != held['tree']:
                raise Refused('run tree replaced since assessment; nothing removed')
            self.deps_fd = os.open('node_modules', DIR_FLAGS, dir_fd=self.tree_fd)
            if (identity(os.fstat(self.deps_fd)) != held['deps']
                    or mount_id(self.deps_fd) != mount_id(self.tree_fd)):
                raise Refused('dependencies replaced or mounted since assessment; nothing removed')
        except BaseException:
            self.close()
            raise

    def close(self):
        for fd in (self.deps_fd, self.tree_fd):
            if fd is not None:
                os.close(fd)
        self.deps_fd = self.tree_fd = None


def write_marker(evidence, name, value):
    """Exclusive create inside the evidence directory; never replaced or followed."""
    evidence_fd = open_dir(evidence)
    try:
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=evidence_fd)
        with os.fdopen(fd, 'w') as handle:
            handle.write(json.dumps(value, indent=2) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        os.close(evidence_fd)


def prune_run(evidence, size, held):
    """Remove node_modules relative to the held tree descriptor; no absolute-path deletion."""
    run = json.loads((evidence / 'run.json').read_text())
    tree = RUNS / evidence.name
    intent = dict(run=evidence.name, tree=str(tree), head=run['head'], pr=run['pr'],
                  tree_identity=held['tree'], dependency_identity=held['deps'],
                  apparent_dependency_bytes=size, recorded_at=utc())
    target = anchored(tree, held)
    try:
        mount_inside(tree)
        write_marker(evidence, 'retention-intent.json', intent)
        walk_dependencies(target.deps_fd, remove=True)
        os.close(target.deps_fd)
        target.deps_fd = None
        again = os.stat('node_modules', dir_fd=target.tree_fd, follow_symlinks=False)
        if identity(again) != held['deps']:
            raise Refused('dependency directory replaced during removal')
        os.rmdir('node_modules', dir_fd=target.tree_fd)
        try:
            os.stat('node_modules', dir_fd=target.tree_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise Refused('dependency removal incomplete')
    finally:
        target.close()
    write_marker(evidence, 'retention-pruned.json', dict(intent, finished_at=utc()))


def retention(apply=False):
    """Plan, or apply, removal of node_modules from finished, merged/closed runs.

    Only node_modules is ever deleted: run trees, source, Git history, logs,
    snapshots and receipts stay. Any doubt keeps the run.
    """
    days = retention_days()
    root = STATE / 'policai-collection-runs'
    rows = []
    if root.exists():
        owned_dir(root)
        open_branches = {pr['headRefName'] for pr in pending()}
        active_id = active_run_id()
        for evidence in sorted(root.iterdir()):
            row = dict(run=evidence.name, status='kept', reason='', apparent_dependency_bytes=0)
            try:
                reason, size, unreadable, held = assess_run(evidence, open_branches, active_id, days)
                row['apparent_dependency_bytes'] = size
                row['unreadable_processes'] = unreadable
                if reason:
                    row['reason'] = reason
                else:
                    row['status'] = 'eligible'
                    if apply:
                        prune_run(evidence, size, held)
                        row['status'] = 'pruned'
            except (Refused, OSError, ValueError, KeyError, TypeError,
                    subprocess.TimeoutExpired) as exc:
                row['reason'] = f'unverifiable: {exc}'
                if apply and row['status'] == 'eligible':
                    row['status'] = 'failed'
            rows.append(row)
            if row['status'] == 'failed':
                break
    total = lambda status: sum(r['apparent_dependency_bytes'] for r in rows if r['status'] == status)
    return dict(runs=rows, eligible_bytes=total('eligible'), pruned_bytes=total('pruned'),
                failed=sum(r['status'] == 'failed' for r in rows))


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
    if sys.argv[1:] in (['--retention-plan'], ['--retention-apply']):
        DEADLINE = time.monotonic() + 600
        try:
            # Existing lock only: neither mode creates state; plan writes nothing.
            with (STATE / 'policai-collect.lock').open('r') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                report = retention(apply=sys.argv[1:] == ['--retention-apply'])
                print(json.dumps(report, indent=2))
            return 1 if report['failed'] else 0
        except BlockingIOError:
            return 75
        except (OSError, ValueError, Refused, subprocess.TimeoutExpired) as exc:
            print(str(exc), file=sys.stderr)
            return 1
    if sys.argv[1:] not in ([], ['--preflight'], ['--retry-publication']):
        print('Usage: policai-collect.sh [--preflight|--retry-publication|--storage-status'
              '|--retention-plan|--retention-apply]', file=sys.stderr)
        return 2
    budget = min(3500, max(1, int(os.environ.get('POLICAI_COLLECT_MAX_SECONDS', '3500'))))
    DEADLINE = time.monotonic() + budget
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
                if not previous or previous['phase'] not in ('ready', 'superseding', 'published'):
                    raise Refused('no validated commit available for publication retry')
                run = previous
                rc = publish(run)
            else:
                if prune_enabled():
                    # Best effort: a prune problem keeps evidence and never blocks
                    # or fails the run; the admission cap below still applies.
                    # Retention has its own bounded budget; the collection's full
                    # budget starts only afterwards, so slow retention cannot
                    # shorten collection or publication.
                    try:
                        DEADLINE = time.monotonic() + retention_seconds()
                        report = retention(apply=True)
                        print('Retention:', json.dumps(report), file=sys.stderr)
                    except (Refused, OSError, ValueError, KeyError, TypeError,
                            subprocess.TimeoutExpired) as exc:
                        print(f'Retention skipped: {exc}', file=sys.stderr)
                    finally:
                        DEADLINE = time.monotonic() + budget
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
