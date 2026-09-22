"""Integration tests: real temporary Git repositories; only npm/GitHub are fakes."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('policai-collect.sh')


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
        for name in ['data/policies.json', 'data/developments.json', 'data/watch-state.json', 'data/source-reviews.json', 'public/data/meta.json', 'package-lock.json']:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}\n')
        self.git('add', '.')
        self.git('commit', '-m', 'fixture')
        self.git('remote', 'add', 'origin', str(self.remote))
        self.git('push', '-u', 'origin', 'main')
        self.base = self.git('rev-parse', 'HEAD').strip()
        bin_dir = self.home / '.local/bin'
        bin_dir.mkdir(parents=True)
        npm = bin_dir / 'npm'
        npm.write_text('''#!/usr/bin/env python3
import os, pathlib, sys
if sys.argv[1:] == ['run', 'collect']:
    pathlib.Path('data/developments.json').write_text('{"collected":true}\\n')
    sys.exit(0)
''')
        npm.chmod(0o755)
        gh = bin_dir / 'gh'
        gh.write_text('''#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys
p = pathlib.Path(os.environ['HOME'])/'pr.json'
a = sys.argv[1:]
if a[:2] == ['pr','list']:
    print('['+p.read_text()+']' if p.exists() else '[]')
elif a[:2] == ['pr','create']:
    branch=a[a.index('--head')+1]
    sha=subprocess.check_output(['git','rev-parse',branch], text=True).strip()
    p.write_text(json.dumps(dict(url='https://github.com/l0cka/policai/pull/999',headRefName=branch,headRefOid=sha,baseRefName='main',state='OPEN',isDraft=True)))
    print('https://github.com/l0cka/policai/pull/999')
elif a[:2] == ['pr','view']:
    print(p.read_text())
else:
    sys.exit(2)
''')
        gh.chmod(0o755)
        ca = self.home / '.local/share/policai/geotrust-tls-rsa-ca-g1.pem'
        ca.parent.mkdir(parents=True)
        ca.touch()
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(bin_dir)+':'+os.environ['PATH'])
        self.env.pop('USE_CLAUDE_CLASSIFIER', None)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, stderr=subprocess.DEVNULL, text=True)

    def run_workflow(self, *args):
        return subprocess.run(['python3', str(SCRIPT), *args], env=self.env, capture_output=True, text=True, timeout=30)

    def set_collector(self, body):
        (self.home / '.local/bin/npm').write_text('#!/usr/bin/env python3\nimport pathlib,sys,time,subprocess\nif sys.argv[1:] == ["run", "collect"]:\n' + '\n'.join('    '+line for line in body.splitlines()) + '\n')

    def receipt(self):
        return json.loads((self.home / '.local/state/argus-jobs/policai-collect.json').read_text())

    def test_unhealthy_outputs_preserved_and_failure_visible(self):
        self.set_collector('pathlib.Path("data/developments.json").write_text("{\\\"failed\\\":true}")\nsys.exit(1)')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        receipt = self.receipt()
        self.assertEqual(receipt['collection_exit'], 1)
        self.assertTrue((Path(receipt['evidence']) / 'after/data/developments.json').exists())
        self.assertEqual(receipt['register_before'], receipt['register_after'])
        self.assertTrue((self.home / 'pr.json').exists())

    def test_register_mutation_retained_never_published(self):
        self.set_collector('pathlib.Path("data/policies.json").write_text("mutation")\nsys.exit(1)')
        result = self.run_workflow()
        self.assertNotEqual(result.returncode, 0)
        receipt = self.receipt()
        evidence = Path(receipt['evidence'])
        self.assertEqual((evidence / 'before/data/policies.json').read_text(), '{}\n')
        self.assertEqual((evidence / 'after/data/policies.json').read_text(), 'mutation')
        self.assertFalse((self.home / 'pr.json').exists())

    def test_validation_failure_preserves_without_pr(self):
        npm = self.home / '.local/bin/npm'
        npm.write_text(npm.read_text() + '\nif sys.argv[1:] == ["run", "validate:data"]: sys.exit(3)\n')
        result = self.run_workflow()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.receipt()['validation_exit'], 3)
        self.assertFalse((self.home / 'pr.json').exists())

    def test_staged_or_untracked_input_refused_without_mutation(self):
        for staged in [False, True]:
            with self.subTest(staged=staged):
                (self.repo / 'unexpected.json').write_text('do not touch')
                if staged:
                    self.git('add', 'unexpected.json')
                before = self.git('status', '--porcelain')
                self.assertNotEqual(self.run_workflow().returncode, 0)
                self.assertEqual(self.git('status', '--porcelain'), before)
                self.assertFalse((self.home / 'pr.json').exists())

    def test_unexpected_output_untracked_and_staged_refused(self):
        self.set_collector('pathlib.Path("data/unexpected.json").write_text("private")\nsubprocess.check_call(["git","add","data/unexpected.json"])')
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertEqual((Path(self.receipt()['tree']) / 'data/unexpected.json').read_text(), 'private')

    def assert_index_cancellation_refused(self, path, collected):
        self.set_collector(
            f'path = pathlib.Path({path!r})\n'
            'original = path.read_bytes()\n'
            'path.write_text("unexpected staged content")\n'
            f'subprocess.check_call(["git", "add", "--", {path!r}])\n'
            'path.write_bytes(original)\n'
            + ('pathlib.Path("data/developments.json").write_text("collected")'
               if collected else 'pass'))
        result = self.run_workflow()
        run = self.receipt()
        tree = Path(run['tree'])
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=tree, text=True).strip(), self.base,
            'unexpected staged bytes must not enter even a local commit')
        self.assertEqual(run['phase'], 'collecting')
        self.assertIn(path, run['changed_paths'])
        self.assertIn('unexpected output paths', run['message'])
        self.assertEqual(subprocess.check_output(
            ['git', 'show', ':' + path], cwd=tree, text=True), 'unexpected staged content')
        self.assertEqual((tree / path).read_text(), '{}\n')
        self.assertEqual(run['register_before'], run['register_after'])
        evidence = Path(run['evidence'])
        for phase in ['before', 'after']:
            self.assertEqual((evidence / phase / 'data/policies.json').read_text(), '{}\n')
        if collected:
            self.assertEqual((evidence / 'after/data/developments.json').read_text(), 'collected')
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/' + run['branch']), '')
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)

    def test_index_only_unexpected_change_never_committed(self):
        self.assert_index_cancellation_refused('package-lock.json', collected=True)

    def test_index_only_unexpected_change_not_no_changes_success(self):
        self.assert_index_cancellation_refused('package-lock.json', collected=False)

    def test_index_only_curated_register_change_refused(self):
        self.assert_index_cancellation_refused('data/policies.json', collected=True)

    def test_final_staged_allowlist_refuses_index_change_after_add(self):
        # Exercise the last gate with real Git: inject an index-only change
        # after the wrapper's allowlisted add, without changing working bytes.
        real_git = subprocess.check_output(['which', 'git'], text=True).strip()
        git_shim = self.home / '.local/bin/git'
        git_shim.write_text(
            '#!/usr/bin/env python3\nimport pathlib,subprocess,sys\n'
            f'real_git = {real_git!r}\n'
            'args = sys.argv[1:]\n'
            'subprocess.check_call([real_git, *args])\n'
            'if args[:2] == ["add", "--"] and "public/data/meta.json" in args:\n'
            '    path = pathlib.Path("package-lock.json")\n'
            '    original = path.read_bytes()\n'
            '    path.write_text("late staged content")\n'
            '    subprocess.check_call([real_git, "add", "--", str(path)])\n'
            '    path.write_bytes(original)\n')
        git_shim.chmod(0o755)
        result = self.run_workflow()
        run = self.receipt()
        tree = Path(run['tree'])
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(subprocess.check_output(
            [real_git, 'rev-parse', 'HEAD'], cwd=tree, text=True).strip(), self.base,
            'final staged allowlist must refuse before committing')
        self.assertIn('staged output paths', run['message'])
        self.assertEqual(run['phase'], 'collecting')
        self.assertEqual(subprocess.check_output(
            [real_git, 'show', ':package-lock.json'], cwd=tree, text=True), 'late staged content')
        self.assertEqual((tree / 'package-lock.json').read_text(), '{}\n')
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/' + run['branch']), '')

    def test_pending_pr_blocks_without_new_collection(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        first = (self.home / 'pr.json').read_text()
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertEqual((self.home / 'pr.json').read_text(), first)
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)

    def test_push_failure_retry_idempotent_no_recollection(self):
        hook = self.remote / 'hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        self.assertNotEqual(self.run_workflow().returncode, 0)
        before = self.receipt()
        self.assertEqual(before['phase'], 'ready')
        hook.unlink()
        self.set_collector('sys.exit(99)')
        result = self.run_workflow('--retry-publication')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['head'], before['head'])
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)

    def test_main_advancement_during_run_fails_closed(self):
        # Use a second actual commit on main to reproduce a concurrent remote update.
        self.set_collector('pathlib.Path("data/developments.json").write_text("changed")\nsubprocess.check_call(["git","-C",'+repr(str(self.repo))+',"commit","--allow-empty","-m","remote update"])\nsubprocess.check_call(["git","-C",'+repr(str(self.repo))+',"push","origin","main"])')
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertEqual(self.receipt()['phase'], 'ready')

    def test_lock_contention(self):
        state = self.home / '.local/state/argus-jobs'
        state.mkdir(parents=True)
        with (state / 'policai-collect.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.run_workflow().returncode, 75)
            self.assertFalse((self.home / 'pr.json').exists())

    def test_timeout_preserves_register_and_output(self):
        self.set_collector('pathlib.Path("data/developments.json").write_text("partial")\ntime.sleep(60)')
        self.env['POLICAI_COLLECT_MAX_SECONDS'] = '1'
        self.assertEqual(self.run_workflow().returncode, 124)
        receipt = self.receipt()
        self.assertEqual(receipt['collection_exit'], 124)
        self.assertEqual(receipt['register_before'], receipt['register_after'])
        self.assertEqual((Path(receipt['evidence']) / 'after/data/developments.json').read_text(), 'partial')
        self.assertFalse((self.home / 'pr.json').exists())

    def test_untracked_output_refused(self):
        self.set_collector('pathlib.Path("data/unexpected.json").write_text("private")')
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertIn('data/unexpected.json', self.receipt()['changed_paths'])

    def test_no_changes_needs_no_pr(self):
        self.set_collector('pass')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['phase'], 'no-changes')
        self.assertFalse((self.home / 'pr.json').exists())

    def test_pr_create_failure_reuses_exact_pushed_branch(self):
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','create']:", "elif a[:2] == ['pr','create']:\n    sys.exit(7)"))
        self.assertNotEqual(self.run_workflow().returncode, 0)
        run = self.receipt()
        self.assertEqual(run['phase'], 'ready')
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/'+run['branch']).split()[0], run['head'])
        gh.write_text(original)
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)
        self.assertEqual(self.receipt()['head'], run['head'])

    def test_lost_pr_readback_then_merge_requires_manual_recovery(self):
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','view']:",
                                       "elif a[:2] == ['pr','view']:\n    sys.exit(7)"))
        self.assertEqual(self.run_workflow().returncode, 1)
        first = self.receipt()
        self.assertEqual(first['phase'], 'ready')
        self.assertTrue((self.home / 'pr.json').exists())
        self.git('fetch', 'origin', first['branch'])
        self.git('merge', '--ff-only', 'FETCH_HEAD')
        self.git('push', 'origin', 'main')
        (self.home / 'pr.json').unlink()  # merged PR leaves the OPEN inventory
        gh.write_text(original)
        ordinary = self.run_workflow()
        self.assertEqual(ordinary.returncode, 1)
        self.assertIn('previous incomplete run retained', ordinary.stderr)
        retry = self.run_workflow('--retry-publication')
        self.assertEqual(retry.returncode, 1)
        self.assertIn('main advanced', retry.stderr)
        self.assertEqual(self.receipt()['head'], first['head'])
        self.assertEqual(self.receipt()['phase'], 'ready')
        self.assertTrue((Path(first['evidence']) / 'after/data/developments.json').is_file())
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)

    def test_remote_collection_branch_changed_never_overwritten(self):
        gh = self.home / '.local/bin/gh'
        gh.write_text(gh.read_text().replace("elif a[:2] == ['pr','create']:", "elif a[:2] == ['pr','create']:\n    sys.exit(7)"))
        self.assertNotEqual(self.run_workflow().returncode, 0)
        run = self.receipt()
        subprocess.check_call(['git', '--git-dir', str(self.remote), 'update-ref', 'refs/heads/'+run['branch'], self.base], stdout=subprocess.DEVNULL)
        self.assertNotEqual(self.run_workflow('--retry-publication').returncode, 0)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/'+run['branch']).split()[0], self.base)

    def test_failed_validation_blocks_next_run(self):
        npm = self.home / '.local/bin/npm'
        npm.write_text(npm.read_text() + '\nif sys.argv[1:] == ["run", "validate:data"]: sys.exit(3)\n')
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)
        self.assertFalse((self.home / 'pr.json').exists())

    def test_preflight_does_not_collect(self):
        self.assertEqual(self.run_workflow('--preflight').returncode, 0)
        self.assertFalse((self.home / 'Work/Argus/src/policai-collection-runs').exists())
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_branch_override_cannot_push_main(self):
        self.env['POLICAI_COLLECT_BRANCH'] = 'other'
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)

    def test_success_publishes_pr_not_main_and_preserves_source(self):
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        pr = json.loads((self.home / 'pr.json').read_text())
        self.assertTrue(pr['headRefName'].startswith('automation/collection-'))
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.assertEqual(self.git('rev-parse', 'HEAD').strip(), self.base)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/'+pr['headRefName']).split()[0], pr['headRefOid'])


if __name__ == '__main__':
    unittest.main()
