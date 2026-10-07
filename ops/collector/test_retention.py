"""Dependency retention: only node_modules of finished, merged/closed runs is removed.

Real temporary Git repositories and worktrees; only npm and GitHub are fakes.
Nothing here touches the host's real run trees or state.
"""
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

import test_workflow as workflow


class RetentionTest(unittest.TestCase):
    """Borrows the workflow fixture (home, bare remote, fake npm/gh) but not its tests."""

    git = workflow.WorkflowTest.git
    run_workflow = workflow.WorkflowTest.run_workflow
    set_collector = workflow.WorkflowTest.set_collector
    receipt = workflow.WorkflowTest.receipt

    def setUp(self):
        workflow.WorkflowTest.setUp(self)
        # The real repo ignores node_modules; so must the fixture.
        (self.repo / '.git/info/exclude').write_text('node_modules/\n')
        self.env['POLICAI_COLLECT_RETENTION_DAYS'] = '0'
        self.state = self.home / '.local/state/argus-jobs'

    # -- fixtures ---------------------------------------------------------

    def make_run(self):
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'published')
        tree = Path(run['tree'])
        (tree / 'node_modules/pkg/bin').mkdir(parents=True)
        (tree / 'node_modules/pkg/index.js').write_text('x' * 5000)
        (tree / 'node_modules/pkg/bin/link').symlink_to('../index.js')
        return run

    def set_pr_state(self, url, state):
        for name in ('pr.json', 'old-prs.json'):
            path = self.home / name
            if not path.exists():
                continue
            data = json.loads(path.read_text())
            for pr in (data if isinstance(data, list) else [data]):
                if pr['url'] == url:
                    pr['state'] = state
            path.write_text(json.dumps(data))

    def two_runs(self, merge_first=True):
        """run1 (no longer the active run) and run2 (active, PR still open)."""
        first = self.make_run()
        self.set_pr_state(first['pr'], 'MERGED')
        # Distinct output so the second run is a real change, then a second PR.
        self.set_collector('pathlib.Path("data/developments.json").write_text("{\\"second\\":true}\\n")')
        second = self.make_run()
        self.assertNotEqual(first['evidence'], second['evidence'])
        if not merge_first:
            self.set_pr_state(first['pr'], 'OPEN')
        return first, second

    def plan(self, *args, expect=0):
        result = self.run_workflow(*(args or ('--retention-plan',)))
        self.assertEqual(result.returncode, expect, result.stdout + result.stderr)
        return json.loads(result.stdout) if result.stdout else None

    def row(self, report, run):
        return next(r for r in report['runs'] if r['run'] == Path(run['evidence']).name)

    def snapshot_files(self, root):
        return {str(p.relative_to(root)): (p.lstat().st_mode, p.lstat().st_size)
                for p in sorted(root.rglob('*')) if not p.is_dir()}

    # -- plan -------------------------------------------------------------

    def test_plan_is_read_only_and_names_the_eligible_run(self):
        first, second = self.two_runs()
        before = [self.snapshot_files(Path(r['evidence']).parent) for r in [first]]
        trees = [self.snapshot_files(Path(r['tree'])) for r in (first, second)]
        report = self.plan()
        self.assertEqual(self.row(report, first)['status'], 'eligible')
        self.assertGreater(self.row(report, first)['apparent_dependency_bytes'], 5000)
        self.assertEqual(report['eligible_bytes'], self.row(report, first)['apparent_dependency_bytes'])
        self.assertEqual(self.row(report, second)['status'], 'kept')
        self.assertIn('active run', self.row(report, second)['reason'])
        self.assertEqual(before, [self.snapshot_files(Path(r['evidence']).parent) for r in [first]])
        self.assertEqual(trees, [self.snapshot_files(Path(r['tree'])) for r in (first, second)])

    def test_plan_requires_existing_unlocked_collector_lock(self):
        result = self.run_workflow('--retention-plan')
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.home / '.local/state').exists())
        self.state.mkdir(parents=True)
        (self.state / 'policai-collect.lock').touch()
        with (self.state / 'policai-collect.lock').open('r') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_workflow('--retention-apply')
        self.assertEqual(result.returncode, 75)
        self.assertEqual(result.stdout, '')

    # -- apply ------------------------------------------------------------

    def test_apply_removes_only_node_modules_and_keeps_evidence(self):
        first, second = self.two_runs()
        tree, evidence = Path(first['tree']), Path(first['evidence'])
        kept_files = {k: v for k, v in self.snapshot_files(tree).items()
                      if not k.startswith('node_modules/')}
        evidence_files = self.snapshot_files(evidence)
        branch_head = subprocess.check_output(['git', 'rev-parse', first['branch']],
                                              cwd=self.repo, text=True)
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['status'], 'pruned')
        self.assertGreater(report['pruned_bytes'], 5000)
        self.assertFalse((tree / 'node_modules').exists())
        self.assertEqual({k: v for k, v in self.snapshot_files(tree).items()
                          if not k.startswith('node_modules/')}, kept_files)
        after = self.snapshot_files(evidence)
        self.assertEqual({k: v for k, v in after.items() if not k.startswith('retention-')},
                         evidence_files)
        self.assertEqual(set(after) - set(evidence_files),
                         {'retention-intent.json', 'retention-pruned.json'})
        self.assertEqual(json.loads((evidence / 'retention-pruned.json').read_text())['head'],
                         first['head'])
        self.assertEqual(subprocess.check_output(['git', 'rev-parse', first['branch']],
                                                 cwd=self.repo, text=True), branch_head)
        self.assertEqual(subprocess.check_output(['git', 'status', '--porcelain'],
                                                 cwd=tree, text=True), '')
        # The open-PR run is untouched, and a second apply is a no-op.
        self.assertTrue((Path(second['tree']) / 'node_modules/pkg/index.js').exists())
        again = self.plan('--retention-apply')
        self.assertEqual(self.row(again, first)['reason'], 'already pruned')
        self.assertEqual(again['pruned_bytes'], 0)

    def assert_kept(self, first, reason, expect=0, apply=True):
        report = self.plan('--retention-apply' if apply else '--retention-plan', expect=expect)
        row = self.row(report, first)
        self.assertEqual(row['status'], 'kept', row)
        self.assertIn(reason, row['reason'])
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_active_run_is_kept_even_when_merged(self):
        run = self.make_run()
        self.set_pr_state(run['pr'], 'MERGED')
        self.assert_kept(run, 'active run')

    def test_open_pr_run_is_kept(self):
        first, _second = self.two_runs(merge_first=False)
        self.assert_kept(first, 'collection PR is open')

    def test_closed_pr_is_eligible_like_merged(self):
        first, _second = self.two_runs()
        self.set_pr_state(first['pr'], 'CLOSED')
        self.assertEqual(self.row(self.plan(), first)['status'], 'eligible')

    def test_recent_run_is_kept_by_default_age(self):
        first, _second = self.two_runs()
        del self.env['POLICAI_COLLECT_RETENTION_DAYS']
        self.assert_kept(first, 'less than 7 day')

    def test_unfinished_and_failed_phases_are_kept(self):
        first, _second = self.two_runs()
        path = Path(first['evidence']) / 'run.json'
        for phase in ('ready', 'superseding', 'collecting', 'no-changes'):
            with self.subTest(phase=phase):
                path.write_text(json.dumps(dict(first, phase=phase)))
                self.assert_kept(first, 'only published runs')

    def test_receipt_mismatch_keeps(self):
        first, _second = self.two_runs()
        path = Path(first['evidence']) / 'run.json'
        for change, reason in [(dict(head='0' * 40), 'differs from receipt'),
                               (dict(tree=str(self.home / 'elsewhere')), 'does not match its path'),
                               (dict(branch='automation/collection-other'), 'does not match its path')]:
            with self.subTest(change=change):
                path.write_text(json.dumps(dict(first, **change)))
                self.assert_kept(first, reason)

    def test_dirty_worktree_and_head_drift_keep(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        (tree / 'stray.txt').write_text('operator notes')
        self.assert_kept(first, 'untracked')
        (tree / 'stray.txt').unlink()
        subprocess.check_call(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid',
                               'commit', '--allow-empty', '-m', 'manual'], cwd=tree,
                              stdout=subprocess.DEVNULL)
        self.assert_kept(first, 'HEAD differs')

    def test_symlinked_dependencies_are_never_followed(self):
        first, _second = self.two_runs()
        target = Path(first['tree']) / 'node_modules'
        outside = self.home / 'outside'
        (outside / 'precious').mkdir(parents=True)
        (outside / 'precious/file').write_text('keep')
        for path in sorted(target.rglob('*'), reverse=True):
            path.unlink() if not path.is_dir() or path.is_symlink() else path.rmdir()
        target.rmdir()
        target.symlink_to(outside, target_is_directory=True)
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['status'], 'kept')
        self.assertEqual((outside / 'precious/file').read_text(), 'keep')
        self.assertTrue(target.is_symlink())

    def test_special_file_in_dependencies_keeps(self):
        first, _second = self.two_runs()
        os.mkfifo(Path(first['tree']) / 'node_modules/pipe')
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['status'], 'kept')
        self.assertIn('special file', self.row(report, first)['reason'])
        self.assertTrue((Path(first['tree']) / 'node_modules/pipe').exists())

    def test_running_process_in_tree_keeps(self):
        first, _second = self.two_runs()
        child = subprocess.Popen(['sleep', '60'], cwd=Path(first['tree']) / 'node_modules/pkg')
        try:
            self.assert_kept(first, 'a process references')
        finally:
            child.terminate()
            child.wait(timeout=10)
        self.assertEqual(self.row(self.plan(), first)['status'], 'eligible')

    def test_interrupted_or_reinstalled_prune_is_not_repeated(self):
        first, _second = self.two_runs()
        evidence = Path(first['evidence'])
        (evidence / 'retention-intent.json').write_text('{}\n')
        report = self.plan('--retention-apply')
        self.assertIn('interrupted', self.row(report, first)['reason'])
        (evidence / 'retention-intent.json').unlink()
        (evidence / 'retention-pruned.json').write_text('{}\n')
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['reason'], 'already pruned')
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

    def test_github_failure_refuses_everything(self):
        first, _second = self.two_runs()
        (self.home / '.local/bin/gh').write_text('#!/bin/sh\nexit 97\n')
        result = self.run_workflow('--retention-apply')
        self.assertEqual(result.returncode, 1)
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_unreadable_active_pointer_refuses_everything(self):
        first, _second = self.two_runs()
        (self.state / 'policai-collection-active.json').write_text('[]')
        result = self.run_workflow('--retention-apply')
        self.assertEqual(result.returncode, 1)
        self.assertIn('active pointer unreadable', result.stderr)
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

    def test_non_run_entries_are_ignored(self):
        first, _second = self.two_runs()
        (self.state / 'policai-collection-runs/notes.txt').write_text('operator file')
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['status'], 'pruned')
        self.assertTrue((self.state / 'policai-collection-runs/notes.txt').exists())

    def test_invalid_age_setting_refuses(self):
        self.two_runs()
        for value in ['-1', '1.5', '', ' 1', 'x']:
            with self.subTest(value=value):
                self.env['POLICAI_COLLECT_RETENTION_DAYS'] = value
                self.assertEqual(self.run_workflow('--retention-plan').returncode, 1)

    # -- scheduled run ----------------------------------------------------

    def test_scheduled_run_does_not_prune_unless_enabled(self):
        first, _second = self.two_runs()
        self.run_workflow()
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

    def test_scheduled_run_prunes_when_enabled_even_while_waiting_for_review(self):
        first, second = self.two_runs()
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)  # awaiting review, not a fault
        self.assertIn('Retention:', result.stderr)
        self.assertFalse((Path(first['tree']) / 'node_modules').exists())
        self.assertTrue((Path(second['tree']) / 'node_modules/pkg/index.js').exists())

    def test_prune_setting_must_be_zero_or_one(self):
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = 'yes'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('must be 0 or 1', result.stderr)

    def test_retention_trouble_never_blocks_the_collection(self):
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        self.env['POLICAI_COLLECT_RETENTION_DAYS'] = 'x'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Retention skipped', result.stderr)
        self.assertEqual(self.receipt()['phase'], 'published')

    def test_admission_cap_still_applies_after_a_prune(self):
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        self.env['POLICAI_COLLECT_CAP_BYTES'] = '1'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 1)
        self.assertIn('storage admission refused', result.stderr)

    # -- process scan -----------------------------------------------------

    def subject(self):
        loader = importlib.machinery.SourceFileLoader('retention_subject', str(workflow.SCRIPT))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, HOME=str(self.home)):
            loader.exec_module(module)
        return module

    def test_process_scan_reports_unreadable_processes_without_claiming_inactivity(self):
        module = self.subject()
        fake = self.home / 'proc'
        for pid in ('101', '102'):
            (fake / pid).mkdir(parents=True)
        (fake / '101/cwd').symlink_to(self.home)
        (fake / '101/root').symlink_to('/')
        (fake / '101/exe').symlink_to('/bin/true')
        (fake / '101/fd').mkdir()
        (fake / '101/cmdline').write_bytes(b'sleep\0')
        (fake / '102').chmod(0)
        (fake / 'self').mkdir()
        try:
            with patch.object(module, 'PROC', fake):
                self.assertEqual(module.tree_in_use(self.home / 'tree'), (False, 1))
                (fake / '101/cmdline').write_bytes(f'node\0{self.home}/tree/x.js\0'.encode())
                self.assertEqual(module.tree_in_use(self.home / 'tree')[0], True)
        finally:
            (fake / '102').chmod(0o700)


if __name__ == '__main__':
    unittest.main()
