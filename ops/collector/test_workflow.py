"""Integration tests: real temporary Git repositories; only npm/GitHub are fakes."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('policai-collect.sh')
ALERT = Path(__file__).with_name('policai-collect-alert.sh')

# The fake collector writes one development and stages host state the way
# scripts/collect-run.ts does: under $POLICAI_COLLECTOR_STATE/next/.
COLLECTOR = '''
state = pathlib.Path(os.environ['POLICAI_COLLECTOR_STATE'])
(state / 'next').mkdir(parents=True, exist_ok=True)
(state / 'next' / 'outbox.json').write_text('{"developments":[{"id":"d1"}],"sourceReviews":[]}')
(state / 'next' / 'watch-state.json').write_text('{"seen":{"u":{}}}')
pathlib.Path('data/developments.json').write_text('[{"id":"d1"}]\\n')
'''

UNHEALTHY = COLLECTOR + '''
print('[collect] Analysis mode: keyword rules (detections require review)')
print('[collect] 1 new developments, 0 review candidates, 0 stage updates, 2 source errors; '
      'health failed (3/9 due sources successful)')
print('  + [federal] A development (0.6, heuristic) https://example.gov.au/a')
print('  ! dta-news: HTTP 403 from https://user:hunter2pass@example.gov.au/news?session=abc123#top')
print('  ! nsw-digital: timed out; Authorization: Bearer abcdef123456 api_key=zyx987 github_pat_fixture `@l0cka`')
print('[collect] Source coverage is below the accepted threshold — treating run as failed.')
sys.exit(1)
'''


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='collector-test-')
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.repo = self.home / 'Work/Argus/live/policai-collector'
        self.repo.mkdir(parents=True)
        self.remote = self.home / 'remote.git'
        self.git('init', '--bare', str(self.remote))
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        for name in ['data/policies.json', 'data/developments.json', 'data/watch-state.json',
                     'data/source-reviews.json', 'public/data/meta.json', 'package-lock.json']:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}\n')
        (self.repo / '.gitignore').write_text('node_modules/\n')
        self.git('add', '.')
        self.git('commit', '-m', 'fixture')
        self.git('remote', 'add', 'origin', str(self.remote))
        self.git('push', '-u', 'origin', 'main')
        self.base = self.git('rev-parse', 'HEAD').strip()
        self.bin = self.home / '.local/bin'
        self.bin.mkdir(parents=True)
        self.set_collector(COLLECTOR)
        gh = self.bin / 'gh'
        gh.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
store = pathlib.Path(os.environ['HOME']) / 'prs.json'
prs = json.loads(store.read_text()) if store.exists() else []
a = sys.argv[1:]
if os.environ.get('GH_TOKEN') != 'github_pat_fixture' or os.environ.get('GIT_TERMINAL_PROMPT') != '0':
    sys.exit('gh: no GitHub credential')
if a[:2] == ['pr', 'list']:
    print(json.dumps([dict(url=p['url'], headRefName=p['headRefName']) for p in prs if p['state'] == 'OPEN']))
elif a[:2] == ['pr', 'create']:
    url = 'https://github.com/l0cka/policai/pull/' + str(1000 + len(prs))
    prs.append(dict(url=url, headRefName=a[a.index('--head') + 1], state='OPEN', draft='--draft' in a, comments=[]))
    store.write_text(json.dumps(prs))
    print(url)
elif a[:2] == ['pr', 'close']:
    pr = next(p for p in prs if p['url'] == a[2])
    pr['state'] = 'CLOSED'
    pr['comments'].append(a[a.index('--comment') + 1])
    store.write_text(json.dumps(prs))
else:
    sys.exit(2)
''')
        gh.chmod(0o755)
        ca = self.home / '.local/share/policai/geotrust-tls-rsa-ca-g1.pem'
        ca.parent.mkdir(parents=True)
        ca.touch()
        credentials = self.home / 'credentials'
        credentials.mkdir()
        (credentials / 'github.env').write_text('GH_TOKEN=github_pat_fixture\n')
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.bin) + ':' + os.environ['PATH'],
                        CREDENTIALS_DIRECTORY=str(credentials))
        self.env.pop('GH_TOKEN', None)
        for name in ('USE_CLAUDE_CLASSIFIER', 'USE_CLEF_CLASSIFIER', 'CLASSIFIER_BASE_URL', 'CLASSIFIER_API_KEY'):
            self.env.pop(name, None)
        for name in list(self.env):
            if name.startswith('POLICAI_COLLECT'):
                self.env.pop(name)

    @property
    def state(self):
        return self.home / '.local/state/argus-jobs/policai-collector'

    @property
    def work(self):
        return self.home / 'Work/Argus/src/policai-collector-work'

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', *args], cwd=cwd or self.repo, stderr=subprocess.DEVNULL, text=True)

    def run_workflow(self, *args):
        return subprocess.run(['python3', str(SCRIPT), *args], env=self.env, capture_output=True, text=True, timeout=60)

    def set_collector(self, body, validate_exit=0):
        npm = self.bin / 'npm'
        npm.write_text('#!/usr/bin/env python3\nimport os, pathlib, sys, time\n'
                       'log = pathlib.Path(os.environ["HOME"]) / "npm.log"\n'
                       'log.write_text((log.read_text() if log.exists() else "") + " ".join(sys.argv[1:]) + "\\n")\n'
                       'if sys.argv[1:] == ["ci", "--no-audit", "--no-fund"]: pathlib.Path("node_modules").mkdir(exist_ok=True)\n'
                       f'if sys.argv[1:] == ["run", "validate:data"]: sys.exit({validate_exit})\n'
                       'if sys.argv[1:] == ["run", "collect"]:\n'
                       + '\n'.join('    ' + line for line in body.strip().splitlines()) + '\n')
        npm.chmod(0o755)

    def receipt(self):
        return json.loads((self.home / '.local/state/argus-jobs/policai-collect.json').read_text())

    def prs(self):
        store = self.home / 'prs.json'
        return json.loads(store.read_text()) if store.exists() else []

    def status(self):
        result = self.run_workflow('status', '--json')
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return json.loads(result.stdout)

    def tree(self):
        return {str(path.relative_to(self.home)): hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
                for path in sorted(self.home.rglob('*')) if '.git' not in path.parts}

    def test_success_opens_a_ready_pr_and_promotes_host_state(self):
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        [pr] = self.prs()
        self.assertFalse(pr['draft'])
        self.assertTrue(pr['headRefName'].startswith('automation/collection-'))
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/' + pr['headRefName']).split()[0],
                         self.receipt()['head'])
        self.assertEqual(json.loads((self.state / 'outbox.json').read_text())['developments'], [{'id': 'd1'}])
        self.assertFalse((self.state / 'next').exists())
        self.assertEqual(self.receipt()['phase'], 'published')
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_a_new_run_closes_the_older_collection_pr(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        first, second = self.prs()
        self.assertEqual((first['state'], second['state']), ('CLOSED', 'OPEN'))
        self.assertIn(second['url'], first['comments'][0])

    def test_validation_failure_publishes_nothing_promotes_nothing_and_never_blocks(self):
        self.set_collector(COLLECTOR, validate_exit=3)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('data validation failed', result.stderr)
        self.assertEqual(self.receipt()['validation_exit'], 3)
        self.assertEqual(self.prs(), [])
        self.assertFalse((self.state / 'outbox.json').exists())
        self.set_collector(COLLECTOR)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.prs()), 1)

    def test_main_moving_between_runs_needs_no_reconciliation(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        (self.repo / 'README.md').write_text('moved\n')
        self.git('add', 'README.md')
        self.git('commit', '-m', 'main moves')
        self.git('push', 'origin', 'main')
        moved = self.git('rev-parse', 'HEAD').strip()
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['base'], moved)

    def test_unhealthy_collection_still_publishes_and_exits_nonzero(self):
        self.set_collector(COLLECTOR + 'sys.exit(1)\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.receipt()['collection_exit'], 1)
        self.assertEqual(len(self.prs()), 1)
        self.assertTrue((self.state / 'outbox.json').exists())

    def test_unhealthy_published_run_records_why_in_its_receipt(self):
        self.set_collector(UNHEALTHY)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        receipt = self.receipt()
        self.assertEqual(receipt['phase'], 'published')
        self.assertEqual(receipt['message'], 'collection health failed; output published')
        self.assertIn(receipt['message'], result.stderr)
        self.assertEqual(receipt['collect_reason'], [
            '[collect] 1 new developments, 0 review candidates, 0 stage updates, 2 source errors; '
            'health failed (3/9 due sources successful)',
            '  ! dta-news: HTTP 403 from https://example.gov.au/news',
            "  ! nsw-digital: timed out; Authorization: [redacted] api_key=[redacted] [redacted] '@l0cka'",
        ])
        self.assertEqual(json.loads((Path(receipt['evidence']) / 'run.json').read_text())['collect_reason'],
                         receipt['collect_reason'])

    def test_a_healthy_run_records_no_reason(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        self.assertEqual(self.receipt()['message'], '')
        self.assertNotIn('collect_reason', self.receipt())

    def test_unhealthy_run_without_changes_says_nothing_was_published(self):
        self.set_collector("print('  ! dta-news: HTTP 503')\nsys.exit(1)\n")
        self.assertEqual(self.run_workflow().returncode, 1)
        receipt = self.receipt()
        self.assertEqual(receipt['phase'], 'no-changes')
        self.assertEqual(receipt['message'], 'collection health failed; no output changes to publish')
        self.assertEqual(receipt['collect_reason'], ['  ! dta-news: HTTP 503'])

    def test_the_stored_reason_is_bounded_in_lines_and_bytes(self):
        self.set_collector(COLLECTOR + "for n in range(100): print(f'  ! source-{n}: ' + 'é' * 2000)\nsys.exit(1)\n")
        self.assertEqual(self.run_workflow().returncode, 1)
        reason = self.receipt()['collect_reason']
        self.assertEqual(len(reason), 31)
        self.assertTrue(reason[0].startswith('  ! source-0: '))
        self.assertTrue(reason[29].startswith('  ! source-29: '))
        self.assertEqual(reason[30], '70 more lines in collect.log')
        self.assertTrue(all(len(line.encode()) <= 300 for line in reason))

    def test_the_reason_never_carries_a_secret_environment_value(self):
        self.set_collector(COLLECTOR + "print('  ! leaked ' + os.environ['FIXTURE_API_KEY'] + ' end')\nsys.exit(1)\n")
        self.env['FIXTURE_API_KEY'] = 'fixture-value-0123456789'
        self.assertEqual(self.run_workflow().returncode, 1)
        self.assertEqual(self.receipt()['collect_reason'], ['  ! leaked [redacted] end'])

    def test_the_alert_prints_the_message_and_the_reason(self):
        self.set_collector(UNHEALTHY)
        self.assertEqual(self.run_workflow().returncode, 1)
        (self.bin / 'gh').write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
a = sys.argv[1:]
if a[:2] == ['issue', 'list']:
    sys.exit(0)
if a[:2] == ['issue', 'create']:
    (pathlib.Path(os.environ['HOME']) / 'issue.json').write_text(json.dumps(a))
''')
        (self.bin / 'journalctl').write_text('#!/bin/sh\necho "journal fixture line"\n')
        (self.bin / 'journalctl').chmod(0o755)
        result = subprocess.run(['bash', str(ALERT)], env=self.env, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        issue = json.loads((self.home / 'issue.json').read_text())
        body = issue[issue.index('--body') + 1]
        receipt = self.receipt()
        for expected in ('phase: published', 'exit_code: 1', 'message: collection health failed; output published',
                         'collect_reason:', *receipt['collect_reason'], 'journal fixture line'):
            self.assertIn(expected, body)
        for secret in ('hunter2pass', 'abc123', 'abcdef123456', 'zyx987', 'github_pat_fixture', '`'):
            self.assertNotIn(secret, body.replace('```', ''))

    def test_register_mutation_never_published(self):
        self.set_collector(COLLECTOR + 'pathlib.Path("data/policies.json").write_text("mutation")\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('curated register', result.stderr)
        evidence = Path(self.receipt()['evidence'])
        self.assertEqual((evidence / 'after/data/policies.json').read_text(), 'mutation')
        self.assertEqual(self.prs(), [])
        self.assertFalse((self.state / 'outbox.json').exists())

    def test_unexpected_output_path_never_published(self):
        self.set_collector(COLLECTOR + 'pathlib.Path("data/unexpected.json").write_text("private")\n')
        self.assertEqual(self.run_workflow().returncode, 1)
        self.assertIn('data/unexpected.json', self.receipt()['changed_paths'])
        self.assertEqual(self.prs(), [])

    def test_leftovers_in_the_worktree_are_reset_by_the_next_run(self):
        self.set_collector(COLLECTOR + 'pathlib.Path("data/unexpected.json").write_text("private")\n')
        self.assertEqual(self.run_workflow().returncode, 1)
        self.set_collector(COLLECTOR)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.work / 'data/unexpected.json').exists())

    def test_timeout_publishes_nothing(self):
        self.set_collector(COLLECTOR + 'time.sleep(60)\n')
        self.env['POLICAI_COLLECT_MAX_SECONDS'] = '3'
        self.assertEqual(self.run_workflow().returncode, 124)
        self.assertEqual(self.receipt()['collection_exit'], 124)
        self.assertEqual(self.prs(), [])
        self.assertFalse((self.state / 'outbox.json').exists())

    def test_no_changes_needs_no_pr(self):
        self.set_collector('pass')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['phase'], 'no-changes')
        self.assertEqual(self.prs(), [])

    def test_dependencies_install_once_per_lockfile(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        self.assertEqual(self.run_workflow().returncode, 0)
        installs = (self.home / 'npm.log').read_text().count('ci --no-audit')
        self.assertEqual(installs, 1)

    def test_host_commit_signing_cannot_stop_the_commit(self):
        # Argus's global git config signs through the 1Password agent, which the sandboxed unit cannot reach.
        (self.home / '.gitconfig').write_text('[commit]\n\tgpgsign = true\n[gpg]\n\tformat = ssh\n'
                                              '[gpg "ssh"]\n\tprogram = /nonexistent/op-ssh-sign\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(self.receipt()['phase'], 'published')

    def test_a_failed_git_command_reports_its_stderr(self):
        (self.home / '.gitconfig').write_text('[core]\n\thooksPath = ' + str(self.home / 'hooks') + '\n')
        hook = self.home / 'hooks/pre-commit'
        hook.parent.mkdir()
        hook.write_text('#!/bin/sh\necho "hook says no" >&2\nexit 1\n')
        hook.chmod(0o755)
        self.assertEqual(self.run_workflow().returncode, 1)
        self.assertIn('hook says no', self.receipt()['message'])

    def test_pr_create_failure_keeps_state_for_the_next_run(self):
        gh = self.bin / 'gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr', 'create']:", "elif a[:2] == ['pr', 'create']:\n    sys.exit(7)"))
        self.assertEqual(self.run_workflow().returncode, 1)
        self.assertTrue((self.state / 'outbox.json').exists())
        gh.write_text(original)
        self.assertEqual(self.run_workflow().returncode, 0)
        self.assertEqual(len(self.prs()), 1)

    def test_a_branch_held_by_a_retired_per_run_worktree_does_not_stop_the_run(self):
        old = self.home / 'Work/Argus/src/policai-collection-runs/old'
        self.git('worktree', 'add', '-b', 'automation/collection-old', str(old), self.base)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(old.is_dir())

    def test_lock_contention(self):
        state = self.home / '.local/state/argus-jobs'
        state.mkdir(parents=True)
        with (state / 'policai-collect.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.run_workflow().returncode, 75)
        self.assertEqual(self.prs(), [])

    def test_preflight_does_not_collect(self):
        self.assertEqual(self.run_workflow('--preflight').returncode, 0)
        self.assertFalse(self.work.exists())
        self.assertFalse((self.home / 'npm.log').exists())

    def test_github_credential_reaches_git_and_gh_but_not_the_collector(self):
        self.set_collector(COLLECTOR + 'assert "GH_TOKEN" not in os.environ\n')
        hook = self.home / 'hooks/pre-push'
        hook.parent.mkdir()
        hook.write_text('#!/bin/sh\nprintf "%s %s\\n" "$GH_TOKEN" "$GIT_TERMINAL_PROMPT" >> "$HOME/push.log"\n')
        hook.chmod(0o755)
        (self.home / '.gitconfig').write_text('[core]\n\thooksPath = ' + str(hook.parent) + '\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(self.receipt()['phase'], 'published')
        self.assertEqual((self.home / 'push.log').read_text(), 'github_pat_fixture 0\n')

    def test_a_missing_or_empty_github_credential_refuses_before_collecting(self):
        for name, body in (('missing', None), ('empty', 'GH_TOKEN=\n'), ('repeated', 'GH_TOKEN=a\nGH_TOKEN=b\n')):
            with self.subTest(name=name):
                path = self.home / 'credentials' / 'github.env'
                if body is None:
                    path.unlink()
                else:
                    path.write_text(body)
                for args in ((), ('--preflight',)):
                    result = self.run_workflow(*args)
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('github.env', result.stderr + result.stdout)
        self.assertFalse(self.work.exists())
        self.assertFalse((self.home / 'npm.log').exists())

    def test_branch_override_cannot_push_main(self):
        self.env['POLICAI_COLLECT_BRANCH'] = 'other'
        self.assertEqual(self.run_workflow().returncode, 1)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)

    def test_cloud_classifier_refuses_and_local_clef_passes_through(self):
        for name, value in (('USE_CLAUDE_CLASSIFIER', '1'), ('CLASSIFIER_API_KEY', 'k'), ('USE_CLEF_CLASSIFIER', 'yes')):
            with self.subTest(name=name):
                env = dict(self.env)
                self.env[name] = value
                result = self.run_workflow()
                self.assertEqual(result.returncode, 1)
                self.assertIn('classifier', result.stderr.lower())
                self.env = env
        self.assertFalse(self.work.exists())
        self.env['USE_CLEF_CLASSIFIER'] = '1'
        self.set_collector(COLLECTOR + 'assert os.environ["USE_CLEF_CLASSIFIER"] == "1"\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_status_before_any_run_reports_nothing_and_creates_nothing(self):
        before = self.tree()
        self.assertEqual(self.status(), dict(lock='free', receipt=None, watch_state=None, outbox=None))
        self.assertEqual(self.tree(), before)
        self.assertFalse((self.home / '.local/state').exists())

    def test_status_reports_the_last_run_and_writes_nothing(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        before = self.tree()
        status = self.status()
        receipt = self.receipt()
        self.assertEqual(status['lock'], 'free')
        self.assertEqual(status['receipt'], dict(run_id=receipt['run_id'], phase='published', exit_code=0, message='',
                                                 pr=receipt['pr'], finished_at=receipt['finished_at'],
                                                 evidence=receipt['evidence']))
        self.assertEqual(status['outbox'], dict(developments=1, source_reviews=0))
        self.assertEqual(status['watch_state']['modified_at'][-6:], '+00:00')
        self.assertLess(status['watch_state']['age_seconds'], 60)
        text = self.run_workflow('status')
        self.assertEqual(text.returncode, 0, text.stderr)
        for expected in ('Lock: free', receipt['run_id'], receipt['pr'], receipt['evidence'],
                         '1 developments, 0 source reviews'):
            self.assertIn(expected, text.stdout)
        self.assertEqual(self.tree(), before)

    def test_status_of_a_failed_run_exits_zero_and_carries_its_message(self):
        self.set_collector(COLLECTOR, validate_exit=3)
        self.assertEqual(self.run_workflow().returncode, 1)
        status = self.status()
        self.assertEqual(status['receipt']['exit_code'], 1)
        self.assertIn('data validation failed', status['receipt']['message'])
        self.assertIsNone(status['outbox'])

    def test_status_reads_a_receipt_from_a_run_refused_before_it_started(self):
        (self.home / 'credentials/github.env').unlink()
        self.assertEqual(self.run_workflow().returncode, 1)
        receipt = self.status()['receipt']
        self.assertEqual((receipt['run_id'], receipt['phase'], receipt['evidence'], receipt['exit_code']),
                         (None, None, None, 1))
        self.assertIn('github.env', receipt['message'])
        self.assertIn('github.env', self.run_workflow('status').stdout)

    def test_status_neither_blocks_on_nor_takes_a_held_lock(self):
        state = self.home / '.local/state/argus-jobs'
        state.mkdir(parents=True)
        with (state / 'policai-collect.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            before = self.tree()
            status = self.status()
            text = self.run_workflow('status')
            self.assertEqual(self.tree(), before)
        self.assertEqual(text.returncode, 0, text.stderr)
        if Path('/proc/locks').is_file():
            self.assertEqual(status['lock'], 'held')
            self.assertIn('Lock: held', text.stdout)
            self.assertEqual(self.status()['lock'], 'free')
        self.assertEqual(self.run_workflow().returncode, 0)

    def test_status_needs_no_credential_and_reaches_neither_git_nor_npm(self):
        (self.home / 'credentials/github.env').unlink()
        self.env['USE_CLAUDE_CLASSIFIER'] = '1'
        self.env['PATH'] = str(self.bin)
        for name in ('git', 'gh', 'npm'):
            (self.bin / name).write_text('#!/bin/sh\necho "$0" >> "$HOME/called.log"\nexit 1\n')
            (self.bin / name).chmod(0o755)
        result = subprocess.run([sys.executable, str(SCRIPT), 'status'], env=self.env, capture_output=True, text=True,
                                timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.home / 'called.log').exists())

    def test_status_reports_an_unreadable_file_and_still_answers_the_rest(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        (self.home / '.local/state/argus-jobs/policai-collect.json').write_text('{')
        (self.state / 'outbox.json').write_text('[]')
        status = self.status()
        self.assertEqual((status['receipt'], status['outbox']), ('unreadable', 'unreadable'))
        self.assertLess(status['watch_state']['age_seconds'], 60)
        self.assertIn('Outbox: unreadable', self.run_workflow('status').stdout)

    def test_unknown_arguments_print_usage_and_touch_nothing(self):
        for args in (('status', '--verbose'), ('--json',), ('status', '--json', 'extra')):
            with self.subTest(args=args):
                result = self.run_workflow(*args)
                self.assertEqual(result.returncode, 2)
                self.assertIn('status [--json]', result.stderr)
        self.assertFalse((self.home / '.local/state').exists())


if __name__ == '__main__':
    unittest.main()
