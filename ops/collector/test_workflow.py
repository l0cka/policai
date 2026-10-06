"""Integration tests: real temporary Git repositories; only npm/GitHub are fakes."""
import datetime
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
archive = p.with_name('old-prs.json')
old = json.loads(archive.read_text()) if archive.exists() else []
current = json.loads(p.read_text()) if p.exists() else None
prs = old + ([current] if current else [])
a = sys.argv[1:]
def fields(pr):
    return {key: pr[key] for key in a[a.index('--json')+1].split(',') if key in pr}
if a[:2] == ['pr','list']:
    print(json.dumps([fields(pr) for pr in prs if pr['state'] == 'OPEN']))
elif a[:2] == ['pr','create']:
    branch=a[a.index('--head')+1]
    sha=subprocess.check_output(['git','rev-parse',branch], text=True).strip()
    if current:
        old.append(current)
        archive.write_text(json.dumps(old))
    url = 'https://github.com/l0cka/policai/pull/' + str(999 + len(old))
    p.write_text(json.dumps(dict(url=url,headRefName=branch,headRefOid=sha,baseRefName='main',state='OPEN',isDraft=True,reviewDecision='',reviews=[],isCrossRepository=False,comments=[],body=a[a.index('--body')+1],createdAt=os.environ.get('FAKE_PR_CREATED_AT','2099-01-01T00:00:00Z'))))
    print(url)
elif a[:2] == ['pr','view']:
    print(json.dumps(fields(next(pr for pr in prs if pr['url'] == a[2]))))
elif a[:2] == ['pr','close']:
    pr = next(pr for pr in prs if pr['url'] == a[2])
    pr['state'] = 'CLOSED'
    if '--comment' in a:
        pr['comments'].append({'body': a[a.index('--comment')+1]})
    archive.write_text(json.dumps(old))
    if current:
        p.write_text(json.dumps(current))
else:
    sys.exit(2)
''')
        gh.chmod(0o755)
        ca = self.home / '.local/share/policai/geotrust-tls-rsa-ca-g1.pem'
        ca.parent.mkdir(parents=True)
        ca.touch()
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(bin_dir)+':'+os.environ['PATH'])
        self.env.pop('USE_CLAUDE_CLASSIFIER', None)
        for name in list(self.env):
            if name.startswith('POLICAI_COLLECT_'):
                self.env.pop(name)

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

    def state_only_run(self):
        self.env['FAKE_PR_CREATED_AT'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.set_collector('pathlib.Path("data/watch-state.json").write_text("state")')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        return self.receipt()

    def test_state_only_pr_superseded_with_evidence_and_fresh_base(self):
        first = self.state_only_run()
        pr_path = self.home / 'pr.json'
        pr = json.loads(pr_path.read_text())
        pr['reviewDecision'] = 'REVIEW_REQUIRED'
        pr_path.write_text(json.dumps(pr))
        tree = Path(first['tree'])
        evidence = Path(first['evidence'])
        retained = {str(p.relative_to(evidence)): p.read_bytes()
                    for p in evidence.rglob('*') if p.is_file()}
        original_tree_state = (tree / 'data/watch-state.json').read_bytes()
        self.git('commit', '--allow-empty', '-m', 'new main')
        self.git('push', 'origin', 'main')
        fresh_base = self.git('rev-parse', 'HEAD').strip()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector('pathlib.Path("public/data/meta.json").write_text("fresh")')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        second = self.receipt()
        self.assertNotEqual(second.get('tree'), first['tree'])
        self.assertEqual(second.get('base'), fresh_base)
        self.assertEqual(second['superseded_prs'][0]['url'], first['pr'])
        self.assertEqual(second['superseded_prs'][0]['status'], 'closed')
        old = json.loads((self.home / 'old-prs.json').read_text())[0]
        new = json.loads((self.home / 'pr.json').read_text())
        self.assertEqual(old['state'], 'CLOSED')
        self.assertIn(second['branch'], old['comments'][0]['body'])
        self.assertIn(first['pr'], new['body'])
        self.assertTrue(new['isDraft'])
        self.assertEqual({str(p.relative_to(evidence)): p.read_bytes()
                          for p in evidence.rglob('*') if p.is_file()}, retained)
        self.assertEqual((tree / 'data/watch-state.json').read_bytes(), original_tree_state)
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/'+first['branch']).split()[0], first['head'])
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], fresh_base)

    def assert_review_blocked(self, first):
        before = (self.home / 'pr.json').read_bytes()
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
        self.assertEqual((self.home / 'pr.json').read_bytes(), before)
        self.assertEqual(len(list(Path(first['tree']).parent.iterdir())), 1)

    def test_state_only_toggle_off_keeps_review_wait(self):
        first = self.state_only_run()
        self.assert_review_blocked(first)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '0'
        self.assert_review_blocked(first)

    def test_ready_or_reviewed_state_pr_keeps_ordinary_gate(self):
        first = self.state_only_run()
        p = self.home / 'pr.json'
        original = json.loads(p.read_text())
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        for draft, decision, reviews in [
                (False, '', []), (False, 'APPROVED', []),
                (True, 'APPROVED', []), (True, 'CHANGES_REQUESTED', []),
                (True, 'REVIEW_REQUIRED', [{'state': 'APPROVED'}]),
                (True, '', [{'state': 'COMMENTED'}])]:
            with self.subTest(draft=draft, decision=decision, reviews=reviews):
                pr = dict(original, isDraft=draft, reviewDecision=decision, reviews=reviews)
                p.write_text(json.dumps(pr))
                self.assert_review_blocked(first)

    def test_state_pr_promoted_after_readback_is_not_closed(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        view = "    print(json.dumps(fields(next(pr for pr in prs if pr['url'] == a[2]))))"
        gh.write_text(original.replace(view, view + '\n' +
            f"    if a[2] == {first['pr']!r}:\n"
            "        pr = next(pr for pr in prs if pr['url'] == a[2])\n"
            "        pr.update(isDraft=False, reviewDecision='APPROVED')\n"
            "        archive.write_text(json.dumps(old))\n"
            "        p.write_text(json.dumps(current))"))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        old = json.loads((self.home / 'old-prs.json').read_text())[0]
        self.assertEqual(old['state'], 'OPEN')
        self.assertEqual(old['comments'], [])
        self.assertEqual(self.receipt()['phase'], 'superseding')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')

    def test_state_only_toggle_rejects_invalid_value(self):
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = 'true'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('must be 0 or 1', result.stderr)
        self.assertNotIn('tree', self.receipt())

    def test_mixed_pr_still_blocks_with_toggle_on(self):
        self.env['FAKE_PR_CREATED_AT'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.set_collector('pathlib.Path("data/watch-state.json").write_text("state")\n'
                           'pathlib.Path("data/source-reviews.json").write_text("review")')
        self.assertEqual(self.run_workflow().returncode, 0)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(self.receipt())

    def test_developments_only_pr_still_blocks_with_toggle_on(self):
        self.env['FAKE_PR_CREATED_AT'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.assertEqual(self.run_workflow().returncode, 0)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(self.receipt())

    def test_state_only_receipt_register_hash_change_still_blocks(self):
        first = self.state_only_run()
        first['register_after'] = '0' * 64
        (Path(first['evidence']) / 'run.json').write_text(json.dumps(first))
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(first)

    def test_state_only_requires_matching_local_collector_provenance(self):
        first = self.state_only_run()
        receipt_path = Path(first['evidence']) / 'run.json'
        original = receipt_path.read_bytes()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        for field, value in [('head', '0' * 40), ('pr', 'wrong'),
                             ('branch', 'automation/collection-unknown'),
                             ('phase', 'ready')]:
            with self.subTest(field=field):
                changed = dict(first, **{field: value})
                receipt_path.write_text(json.dumps(changed))
                self.assert_review_blocked(first)
        receipt_path.unlink()
        self.assert_review_blocked(first)
        receipt_path.write_bytes(original)
        pr_path = self.home / 'pr.json'
        pr = json.loads(pr_path.read_text())
        pr['isCrossRepository'] = True
        pr_path.write_text(json.dumps(pr))
        self.assert_review_blocked(first)

    def test_forged_off_main_receipt_base_keeps_review_gate(self):
        first = self.state_only_run()
        tree = Path(first['tree'])
        def g(*args):
            return subprocess.check_output(['git', *args], cwd=tree,
                                           stderr=subprocess.DEVNULL, text=True).strip()
        g('checkout', '-q', '--detach', first['base'])
        (tree / 'data/developments.json').write_text('{"smuggled":true}\n')
        g('commit', '-qam', 'off-main content')
        off_main = g('rev-parse', 'HEAD')
        (tree / 'data/watch-state.json').write_text('state2')
        g('-c', 'user.name=policai-collector[bot]',
          '-c', 'user.email=policai-collector[bot]@users.noreply.github.com',
          'commit', '-qam', 'state')
        head = g('rev-parse', 'HEAD')
        g('push', '-q', '-f', 'origin', head + ':refs/heads/' + first['branch'])
        first.update(head=head, base=off_main)
        (Path(first['evidence']) / 'run.json').write_text(json.dumps(first))
        p = self.home / 'pr.json'
        pr = json.loads(p.read_text())
        pr['headRefOid'] = head
        p.write_text(json.dumps(pr))
        self.assertEqual(set(g('diff', '--name-only', g('merge-base', head, 'origin/main'), head).split()),
                         {'data/developments.json', 'data/watch-state.json'})
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(first)

    def test_symlinked_receipt_keeps_review_gate(self):
        first = self.state_only_run()
        receipt = Path(first['evidence']) / 'run.json'
        moved = self.home / 'moved-run.json'
        receipt.rename(moved)
        receipt.symlink_to(moved)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(first)

    def test_actual_register_diff_blocks_even_with_equal_receipt_hashes(self):
        first = self.state_only_run()
        tree = Path(first['tree'])
        (tree / 'data/policies.json').write_text('changed register')
        subprocess.check_call(['git', 'add', 'data/policies.json'], cwd=tree,
                              stdout=subprocess.DEVNULL)
        # Manufacture a one-commit fixture with misleading equal receipt hashes.
        subprocess.check_call(['git', 'commit', '--amend', '--no-edit'], cwd=tree,
                              stdout=subprocess.DEVNULL)
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=tree, text=True).strip()
        subprocess.check_call(['git', '--git-dir', str(self.remote), 'fetch',
                               '--no-write-fetch-head', str(self.repo), head],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call(['git', '--git-dir', str(self.remote), 'update-ref',
                               'refs/heads/' + first['branch'], head], stdout=subprocess.DEVNULL)
        first['head'] = head
        (Path(first['evidence']) / 'run.json').write_text(json.dumps(first))
        pr_path = self.home / 'pr.json'
        pr = json.loads(pr_path.read_text())
        pr['headRefOid'] = head
        pr_path.write_text(json.dumps(pr))
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(first)

    def assert_no_changes_preserves_pending_pr(self, exit_code):
        first = self.state_only_run()
        before = (self.home / 'pr.json').read_bytes()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector(f'sys.exit({exit_code})')
        result = self.run_workflow()
        self.assertEqual(result.returncode, exit_code, result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'no-changes')
        self.assertEqual(run['collection_exit'], exit_code)
        self.assertEqual(run['superseded_prs'][0]['url'], first['pr'])
        self.assertEqual(run['superseded_prs'][0]['status'], 'planned')
        self.assertEqual((self.home / 'pr.json').read_bytes(), before)
        self.assertEqual(json.loads(before)['state'], 'OPEN')
        self.assertNotIn('pr', run)

    def test_state_only_no_changes_preserves_pending_pr(self):
        self.assert_no_changes_preserves_pending_pr(0)

    def test_state_only_failed_collection_no_output_preserves_pending_pr(self):
        self.assert_no_changes_preserves_pending_pr(1)

    def test_state_only_validation_failure_does_not_close_old_pr(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        npm = self.home / '.local/bin/npm'
        npm.write_text(npm.read_text() + '\nif sys.argv[1:] == ["run", "validate:data"]: sys.exit(3)\n')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.receipt()['superseded_prs'][0]['status'], 'planned')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        self.assertTrue(Path(first['evidence']).exists())

    def test_state_only_close_failure_retries_without_recollection(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','close']:",
                                       "elif a[:2] == ['pr','close']:\n    sys.exit(7)"))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        run = self.receipt()
        self.assertEqual(run['phase'], 'superseding')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['url'], run['pr'])
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        self.assertEqual(json.loads((self.home / 'old-prs.json').read_text())[0]['state'], 'OPEN')
        self.assertIn('previous incomplete run', self.run_workflow().stderr)
        gh.write_text(original)
        self.set_collector('sys.exit(99)')
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)
        self.assertEqual(self.receipt()['head'], run['head'])
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)
        self.assertEqual(len(list(Path(run['tree']).parent.iterdir())), 2)
        old = json.loads((self.home / 'old-prs.json').read_text())[0]
        self.assertEqual(len(old['comments']), 1)

    def test_published_supersession_retry_failure_keeps_timer_unblocked(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector('pathlib.Path("data/developments.json").write_text("replacement")')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        completed = self.receipt()
        self.assertEqual(completed['phase'], 'published')
        self.assertEqual(completed['superseded_prs'][0]['status'], 'closed')
        archive = self.home / 'old-prs.json'
        original = json.loads(archive.read_text())
        replacement = (self.home / 'pr.json').read_bytes()
        self.set_collector('sys.exit(99)')
        for mutation in [dict(isDraft=False), dict(reviews=[{'state': 'COMMENTED'}])]:
            with self.subTest(mutation=mutation):
                archive.write_text(json.dumps([dict(original[0], **mutation)]))
                before = archive.read_bytes()
                retry = self.run_workflow('--retry-publication')
                self.assertEqual(retry.returncode, 1, retry.stderr)
                self.assertIn('superseded PR changed or merged', retry.stderr)
                self.assertEqual(self.receipt()['phase'], 'published')
                self.assertEqual(self.receipt()['head'], completed['head'])
                self.assertEqual(self.receipt()['superseded_prs'], completed['superseded_prs'])
                self.assertEqual(archive.read_bytes(), before)
                self.assertEqual((self.home / 'pr.json').read_bytes(), replacement)
                active = self.home / '.local/state/argus-jobs/policai-collection-active.json'
                self.assertEqual(json.loads(active.read_text())['phase'], 'published')
                self.assertEqual(json.loads((Path(completed['evidence']) / 'run.json').read_text())['phase'],
                                 'published')
                scheduled = self.run_workflow()
                self.assertEqual(scheduled.returncode, 0, scheduled.stderr)
                self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
                self.assertEqual(len(list(Path(completed['tree']).parent.iterdir())), 2)

    def test_state_only_merged_during_collection_refuses_publication(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector(
            'import json\n'
            'pathlib.Path("public/data/meta.json").write_text("new state")\n'
            f'subprocess.check_call(["git", "push", "origin", "{first["head"]}:refs/heads/main"])\n'
            f'p = pathlib.Path({str(self.home / "pr.json")!r})\n'
            'pr = json.loads(p.read_text())\npr["state"] = "MERGED"\np.write_text(json.dumps(pr))')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('main advanced', result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'ready')
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/' + run['branch']), '')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'MERGED')
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 1)

    def test_state_only_multiple_pending_prs_all_superseded(self):
        first = self.state_only_run()
        pr_path = self.home / 'pr.json'
        first_pr = json.loads(pr_path.read_text())
        first_pr['state'] = 'CLOSED'
        pr_path.write_text(json.dumps(first_pr))
        second = self.state_only_run()
        archive_path = self.home / 'old-prs.json'
        old = json.loads(archive_path.read_text())
        old[0]['state'] = 'OPEN'
        archive_path.write_text(json.dumps(old))
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        run = self.receipt()
        self.assertEqual({pr['url'] for pr in run['superseded_prs']}, {first['pr'], second['pr']})
        self.assertTrue(all(pr['status'] == 'closed' for pr in run['superseded_prs']))
        old = json.loads(archive_path.read_text())
        self.assertEqual(len(old), 2)
        self.assertTrue(all(pr['state'] == 'CLOSED' and len(pr['comments']) == 1 for pr in old))
        self.assertEqual(len(list(Path(run['tree']).parent.iterdir())), 3)

    def test_state_only_inventory_with_content_pr_blocks_all(self):
        first = self.state_only_run()
        pr_path = self.home / 'pr.json'
        content_pr = json.loads(pr_path.read_text())
        content_pr.update(url='https://github.com/l0cka/policai/pull/888',
                          headRefName='automation/collection-other')
        (self.home / 'old-prs.json').write_text(json.dumps([content_pr]))
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.assert_review_blocked(first)
        self.assertEqual(json.loads((self.home / 'old-prs.json').read_text())[0]['state'], 'OPEN')

    def test_state_only_changed_pr_during_run_is_not_closed(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector(
            'import json\n'
            'pathlib.Path("public/data/meta.json").write_text("new state")\n'
            f'p = pathlib.Path({str(self.home / "pr.json")!r})\n'
            'pr = json.loads(p.read_text())\npr["headRefOid"] = "0" * 40\np.write_text(json.dumps(pr))')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('changed collection PR', result.stderr)
        pr = json.loads((self.home / 'pr.json').read_text())
        self.assertEqual(pr['state'], 'OPEN')
        self.assertEqual(pr['comments'], [])
        self.assertEqual(self.receipt()['phase'], 'ready')

    def assert_replacement_readback_failure_preserves_old(self, mutation):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','view']:",
            "elif a[:2] == ['pr','view']:\n"
            f"    if a[2] != {first['pr']!r}: {mutation}"))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'ready')
        old = json.loads((self.home / 'old-prs.json').read_text())[0]
        self.assertEqual(old['state'], 'OPEN')
        self.assertEqual(old['comments'], [])
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        gh.write_text(original)
        self.set_collector('sys.exit(99)')
        retry = self.run_workflow('--retry-publication')
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.receipt()['head'], run['head'])
        self.assertEqual(len(json.loads((self.home / 'old-prs.json').read_text())), 1)

    def test_replacement_readback_failure_keeps_both_prs_open(self):
        self.assert_replacement_readback_failure_preserves_old('sys.exit(7)')

    def test_replacement_must_be_draft_before_closing_old(self):
        self.assert_replacement_readback_failure_preserves_old("current['isDraft'] = False")

    def test_state_only_push_failure_keeps_old_open(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        before = (self.home / 'pr.json').read_bytes()
        hook = self.remote / 'hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual((self.home / 'pr.json').read_bytes(), before)
        self.assertEqual(json.loads(before)['url'], first['pr'])
        self.assertEqual(self.receipt()['phase'], 'ready')
        hook.unlink()
        self.set_collector('sys.exit(99)')
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)

    def test_state_only_create_failure_keeps_old_open_and_retry_is_idempotent(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','create']:",
                                       "elif a[:2] == ['pr','create']:\n    sys.exit(7)"))
        self.assertEqual(self.run_workflow().returncode, 1)
        run = self.receipt()
        self.assertEqual(run['phase'], 'ready')
        self.assertEqual(run['superseded_prs'][0]['status'], 'planned')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        self.set_collector('sys.exit(99)')
        gh.write_text(original)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '0'
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 1)
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        result = self.run_workflow('--retry-publication')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['head'], run['head'])
        self.assertEqual(len(json.loads((self.home / 'old-prs.json').read_text())[0]['comments']), 1)
        # A deliberate reopen is not silently closed again by retry.
        archive = self.home / 'old-prs.json'
        old = json.loads(archive.read_text())
        old[0]['state'] = 'OPEN'
        archive.write_text(json.dumps(old))
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 1)
        self.assertEqual(json.loads(archive.read_text())[0]['state'], 'OPEN')

    def test_state_only_closure_readback_failure_retries_without_duplicate_comment(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','view']:",
            "elif a[:2] == ['pr','view']:\n    if next(pr for pr in prs if pr['url'] == a[2])['state'] == 'CLOSED': sys.exit(7)"))
        self.assertEqual(self.run_workflow().returncode, 1)
        run = self.receipt()
        self.assertEqual(run['phase'], 'superseding')
        self.assertEqual(run['superseded_prs'][0]['status'], 'planned')
        self.assertEqual(json.loads((self.home / 'old-prs.json').read_text())[0]['state'], 'CLOSED')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        gh.write_text(original)
        self.set_collector('sys.exit(99)')
        result = self.run_workflow('--retry-publication')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads((self.home / 'old-prs.json').read_text())[0]['comments']), 1)

    def test_state_only_partial_comment_then_close_failure_does_not_duplicate(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("    pr['state'] = 'CLOSED'", "    pr['state'] = 'OPEN'")
                      .replace("        p.write_text(json.dumps(current))",
                               "        p.write_text(json.dumps(current))\n    sys.exit(7)"))
        self.assertEqual(self.run_workflow().returncode, 1)
        pr = json.loads((self.home / 'old-prs.json').read_text())[0]
        self.assertEqual(pr['state'], 'OPEN')
        self.assertEqual(len(pr['comments']), 1)
        gh.write_text(original)
        self.set_collector('sys.exit(99)')
        result = self.run_workflow('--retry-publication')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads((self.home / 'old-prs.json').read_text())[0]['comments']), 1)

    def test_state_only_concurrent_merge_at_closure_fails_readback(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        gh.write_text(gh.read_text().replace("    pr['state'] = 'CLOSED'",
                                            "    pr['state'] = 'MERGED'"))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('read-back mismatch', result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'superseding')
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/' + run['branch']).split()[0], run['head'])
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')

    def test_replacement_notice_requires_whole_url_tokens(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        gh = self.home / '.local/bin/gh'
        original = gh.read_text()
        gh.write_text(original.replace("elif a[:2] == ['pr','view']:",
            "elif a[:2] == ['pr','view']:\n"
            f"    if a[2] != {first['pr']!r}: current['body'] = current['body'].replace({first['pr']!r}, {first['pr'] + '8'!r})"))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('supersession notice missing', result.stderr)
        self.assertEqual(json.loads((self.home / 'old-prs.json').read_text())[0]['state'], 'OPEN')
        self.assertEqual(self.receipt()['phase'], 'ready')
        gh.write_text(original)
        self.assertEqual(self.run_workflow('--retry-publication').returncode, 0)

    def test_state_only_replacement_with_failed_health_keeps_nonzero_exit(self):
        self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.set_collector('pathlib.Path("public/data/meta.json").write_text("unhealthy")\nsys.exit(1)')
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.receipt()['phase'], 'published')
        self.assertEqual(self.receipt()['collection_exit'], 1)
        self.assertEqual(json.loads((self.home / 'old-prs.json').read_text())[0]['state'], 'CLOSED')
        retry = self.run_workflow('--retry-publication')
        self.assertEqual(retry.returncode, 1, retry.stderr)
        self.assertEqual(self.receipt()['phase'], 'published')
        self.assertEqual(self.receipt()['collection_exit'], 1)
        self.assertEqual(self.receipt()['message'], '')

    def test_pending_pr_blocks_without_new_collection(self):
        # A fresh pending PR is a normal wait: skip with exit 0, never recollect.
        self.env['FAKE_PR_CREATED_AT'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.assertEqual(self.run_workflow().returncode, 0)
        first = (self.home / 'pr.json').read_text()
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('skipped: collection PR awaiting review', result.stderr)
        self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
        self.assertEqual(self.receipt()['exit_code'], 0)
        self.assertEqual((self.home / 'pr.json').read_text(), first)
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)

    def test_stale_pending_pr_fails_visibly(self):
        self.env['FAKE_PR_CREATED_AT'] = '2000-01-01T00:00:00Z'
        self.assertEqual(self.run_workflow().returncode, 0)
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('grace 72h', result.stderr)
        self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
        self.assertEqual(len(list((self.home / 'Work/Argus/src/policai-collection-runs').iterdir())), 1)

    def test_pending_pr_without_age_fails_closed(self):
        self.assertEqual(self.run_workflow().returncode, 0)
        data = json.loads((self.home / 'pr.json').read_text())
        data.pop('createdAt')
        (self.home / 'pr.json').write_text(json.dumps(data))
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('age unreadable', result.stderr)

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

    def advance_main_after_next_push(self):
        real_git = subprocess.check_output(['which', 'git'], text=True).strip()
        shim = self.home / '.local/bin/git'
        shim.write_text(
            '#!/usr/bin/env python3\nimport subprocess,sys\n'
            f'real_git = {real_git!r}\n'
            'args = sys.argv[1:]\n'
            'subprocess.check_call([real_git, *args])\n'
            'if args[:1] == ["push"]:\n'
            f'    subprocess.check_call([real_git, "-C", {str(self.repo)!r}, "commit", "--allow-empty", "-m", "main moved"])\n'
            f'    subprocess.check_call([real_git, "-C", {str(self.repo)!r}, "push", "origin", "main"])\n')
        shim.chmod(0o755)

    def test_toggle_off_main_advances_after_push_still_opens_pr(self):
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '0'
        self.advance_main_after_next_push()
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt()['phase'], 'published')
        self.assertEqual(json.loads((self.home / 'pr.json').read_text())['state'], 'OPEN')
        self.assertNotEqual(self.git('ls-remote', 'origin', 'refs/heads/main').split()[0], self.base)

    def test_supersession_main_advances_after_push_keeps_old_open(self):
        first = self.state_only_run()
        self.env['POLICAI_COLLECT_SUPERSEDE_STATE_ONLY'] = '1'
        self.advance_main_after_next_push()
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('main advanced', result.stderr)
        pr = json.loads((self.home / 'pr.json').read_text())
        self.assertEqual(pr['url'], first['pr'])
        self.assertEqual(pr['state'], 'OPEN')
        self.assertEqual(pr['comments'], [])
        self.assertEqual(self.receipt()['phase'], 'ready')

    def test_main_advancement_during_run_fails_closed(self):
        # Use a second actual commit on main to reproduce a concurrent remote update.
        self.set_collector('pathlib.Path("data/developments.json").write_text("changed")\nsubprocess.check_call(["git","-C",'+repr(str(self.repo))+',"commit","--allow-empty","-m","remote update"])\nsubprocess.check_call(["git","-C",'+repr(str(self.repo))+',"push","origin","main"])')
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertFalse((self.home / 'pr.json').exists())
        self.assertEqual(self.receipt()['phase'], 'ready')

    def storage_fixture(self):
        state = self.home / '.local/state/argus-jobs'
        state.mkdir(parents=True, exist_ok=True)
        (state / 'policai-collect.lock').touch()
        return state

    def test_storage_status_reports_without_writing(self):
        state = self.storage_fixture()
        before = {p.name: p.read_bytes() for p in state.iterdir()}
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), dict(
            apparent_bytes=0, cap_bytes=10737418240, headroom_bytes=1073741824,
            admitted=True, automatic_cleanup=False))
        self.assertEqual({p.name: p.read_bytes() for p in state.iterdir()}, before)
        self.assertFalse((self.home / 'Work/Argus/src/policai-collection-runs').exists())

    def test_storage_status_lock_contention(self):
        state = self.storage_fixture()
        with (state / 'policai-collect.lock').open('r') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 75)
        self.assertEqual(result.stdout, '')
        self.assertFalse((state / 'policai-collect.json').exists())

    def test_storage_status_bad_caps(self):
        self.storage_fixture()
        for cap in ['0', '-1', '1.5', '10GiB', '', ' 100']:
            with self.subTest(cap=cap):
                self.env['POLICAI_COLLECT_CAP_BYTES'] = cap
                result = self.run_workflow('--storage-status')
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn('positive decimal byte count', result.stderr)

    def test_storage_status_missing_lock_does_not_create_state(self):
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.home / '.local/state').exists())

    def test_storage_admission_boundary_preserves_retained_bytes(self):
        state = self.storage_fixture()
        roots = [self.home / 'Work/Argus/src/policai-collection-runs',
                 state / 'policai-collection-runs']
        for root in roots:
            root.mkdir(parents=True)
            (root / 'retained').write_bytes(b'evidence')
        used = sum(root.stat().st_size + (root / 'retained').stat().st_size
                   for root in roots)
        for margin in [0, -1, 1]:
            with self.subTest(margin=margin):
                self.env['POLICAI_COLLECT_CAP_BYTES'] = str(used + 1073741824 + margin)
                result = self.run_workflow('--storage-status')
                self.assertEqual(result.returncode, 0, result.stderr)
                status = json.loads(result.stdout)
                self.assertEqual(status['apparent_bytes'], used)
                self.assertEqual(status['admitted'], margin > 0)
                if margin <= 0:
                    result = self.run_workflow()
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertIn('storage admission refused', result.stderr)
                    self.assertFalse((self.home / 'pr.json').exists())
                    self.assertNotIn('tree', self.receipt())
                for root in roots:
                    self.assertEqual((root / 'retained').read_bytes(), b'evidence')
                    self.assertEqual([p.name for p in root.iterdir()], ['retained'])

    def test_storage_status_refuses_symlinked_and_aliased_roots(self):
        state = self.storage_fixture()
        target = self.home / 'target'
        target.mkdir()
        # Direct root symlink, then an aliased parent of the evidence root.
        runs = self.home / 'Work/Argus/src/policai-collection-runs'
        runs.parent.mkdir(parents=True)
        runs.symlink_to(target, target_is_directory=True)
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 1)
        self.assertIn('storage root alias', result.stderr)
        runs.unlink()
        state.rename(target / 'state')
        state.symlink_to(target / 'state', target_is_directory=True)
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 1)
        self.assertIn('storage root alias', result.stderr)

    def test_storage_status_refuses_special_file(self):
        state = self.storage_fixture()
        root = state / 'policai-collection-runs'
        root.mkdir()
        os.mkfifo(root / 'pipe')
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 1)
        self.assertIn('storage inventory special file', result.stderr)
        self.assertTrue((root / 'pipe').exists())

    def test_storage_status_does_not_follow_inner_symlinks(self):
        state = self.storage_fixture()
        root = state / 'policai-collection-runs'
        root.mkdir()
        link = root / 'link'
        link.symlink_to(self.repo, target_is_directory=True)
        result = self.run_workflow('--storage-status')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['apparent_bytes'],
                         root.stat().st_size + link.lstat().st_size)

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
