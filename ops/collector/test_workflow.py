"""Integration tests: real temporary Git repositories; only npm/GitHub are fakes."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('policai-collect.sh')

# The fake collector writes one development and stages host state the way
# scripts/collect-run.ts does: under $POLICAI_COLLECTOR_STATE/next/.
COLLECTOR = '''
state = pathlib.Path(os.environ['POLICAI_COLLECTOR_STATE'])
(state / 'next').mkdir(parents=True, exist_ok=True)
(state / 'next' / 'outbox.json').write_text('{"developments":[{"id":"d1"}],"sourceReviews":[]}')
(state / 'next' / 'watch-state.json').write_text('{"seen":{"u":{}}}')
pathlib.Path('data/developments.json').write_text('[{"id":"d1"}]\\n')
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
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.bin) + ':' + os.environ['PATH'])
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


if __name__ == '__main__':
    unittest.main()
