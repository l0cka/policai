"""Dependency retention: only node_modules of finished, merged/closed runs is removed.

Real temporary Git repositories and worktrees; only npm and GitHub are fakes.
Nothing here touches the host's real run trees or state.
"""
import contextlib
import datetime
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
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
        self.state = self.home / '.local/state/argus-jobs'

    # -- fixtures ---------------------------------------------------------

    def backdate(self, run, days):
        """The seven-day minimum is enforced, so tests age receipts instead."""
        finished = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
        run = dict(run, finished_at=finished.isoformat())
        (Path(run['evidence']) / 'run.json').write_text(json.dumps(run))
        return run

    def make_run(self, age_days=8):
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        run = self.receipt()
        self.assertEqual(run['phase'], 'published')
        tree = Path(run['tree'])
        (tree / 'node_modules/pkg/bin').mkdir(parents=True)
        (tree / 'node_modules/pkg/index.js').write_text('x' * 5000)
        (tree / 'node_modules/pkg/bin/link').symlink_to('../index.js')
        return self.backdate(run, age_days)

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
        self.backdate(first, 6.9)
        self.assert_kept(first, 'less than 7 day')
        self.backdate(first, 8)
        self.env['POLICAI_COLLECT_RETENTION_DAYS'] = '9'
        self.assert_kept(first, 'less than 9 day')

    def test_age_below_the_seven_day_minimum_refuses(self):
        first, _second = self.two_runs()
        self.backdate(first, 0)
        for value in ['0', '1', '6']:
            with self.subTest(value=value):
                self.env['POLICAI_COLLECT_RETENTION_DAYS'] = value
                result = self.run_workflow('--retention-apply')
                self.assertEqual(result.returncode, 1)
                self.assertIn('at least 7', result.stderr)
                self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        # The scheduled path skips retention but still runs its review gate.
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Retention skipped: POLICAI_COLLECT_RETENTION_DAYS must be at least 7',
                      result.stderr)
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

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
        module.DEADLINE = time.monotonic() + 60
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

    def test_disappearing_descriptor_keeps_known_reference_and_counts_incomplete(self):
        """F3: a per-fd race neither discards a reference already read nor stops the scan."""
        module = self.subject()
        module.DEADLINE = time.monotonic() + 60
        fake, tree = self.home / 'proc', self.home / 'tree'
        pid = fake / '101'
        (pid / 'fd').mkdir(parents=True)
        (pid / 'cwd').symlink_to(tree / 'node_modules')
        (pid / 'root').symlink_to('/')
        (pid / 'exe').symlink_to('/bin/true')
        (pid / 'fd/3').symlink_to('/dev/null')
        (pid / 'cmdline').write_bytes(b'sleep\0')
        real = os.readlink

        def vanishing(path, *args, **kwargs):
            if str(path).endswith('/fd/3'):
                raise FileNotFoundError(2, 'descriptor closed', str(path))
            return real(path, *args, **kwargs)

        with patch.object(module, 'PROC', fake), patch.object(module.os, 'readlink', vanishing):
            # cwd inside the tree: positive evidence wins despite the vanished fd.
            self.assertEqual(module.tree_in_use(tree), (True, 0))
            # A later descriptor still counts after an earlier one vanished.
            (pid / 'cwd').unlink()
            (pid / 'cwd').symlink_to(self.home)
            (pid / 'fd/4').symlink_to(tree / 'x.json')
            self.assertEqual(module.tree_in_use(tree), (True, 0))
            # And cmdline is still checked.
            (pid / 'fd/4').unlink()
            (pid / 'cmdline').write_bytes(f'node\0{tree}/x.js\0'.encode())
            self.assertEqual(module.tree_in_use(tree), (True, 0))
            # No reference anywhere: the process is reported as incompletely inspected.
            (pid / 'cmdline').write_bytes(b'sleep\0')
            self.assertEqual(module.tree_in_use(tree), (False, 1))
            module.DEADLINE = time.monotonic() - 1
            with self.assertRaisesRegex(module.Refused, 'process scan deadline'):
                module.tree_in_use(tree)

    # -- active pointer (F4) ----------------------------------------------

    def assert_pointer_refuses(self, first, reason):
        result = self.run_workflow('--retention-apply')
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(reason, result.stderr)
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_dangling_or_symlinked_active_pointer_refuses_everything(self):
        first = self.make_run()  # the active run, made eligible but for the pointer
        self.set_pr_state(first['pr'], 'MERGED')
        pointer = self.state / 'policai-collection-active.json'
        pointer.unlink()
        pointer.symlink_to(self.home / 'missing.json')
        self.assert_pointer_refuses(first, 'not a regular file')
        pointer.unlink()
        (self.home / 'elsewhere.json').write_text(json.dumps(first))
        pointer.symlink_to(self.home / 'elsewhere.json')
        self.assert_pointer_refuses(first, 'not a regular file')
        pointer.unlink()
        pointer.mkdir()
        self.assert_pointer_refuses(first, 'not a regular file')
        pointer.rmdir()
        # Genuine absence is the only state that means "no active run".
        report = self.plan('--retention-apply')
        self.assertEqual(self.row(report, first)['status'], 'pruned')

    def test_malformed_active_pointer_identity_refuses_everything(self):
        first, second = self.two_runs()
        pointer = self.state / 'policai-collection-active.json'
        run_id = Path(second['evidence']).name
        for change in [dict(evidence=str(self.home / 'elsewhere' / run_id)),
                       dict(evidence=str(Path(second['evidence']).parent / 'not-a-run')),
                       dict(tree=str(self.home / 'elsewhere')),
                       dict(branch='automation/collection-other'),
                       dict(evidence=None)]:
            with self.subTest(change=change):
                pointer.write_text(json.dumps(dict(second, **change)))
                self.assert_pointer_refuses(first, 'every run retained')
        pointer.write_text('{not json')
        self.assert_pointer_refuses(first, 'active pointer unreadable')

    # -- descriptor-anchored removal (F1) ---------------------------------

    def retention_in_process(self, after_assess=None, **patches):
        """Run retention(apply=True) in-process, optionally mutating between assessment and removal."""
        module = self.subject()
        module.DEADLINE = time.monotonic() + 120
        real = module.assess_run

        def assess(*args):
            result = real(*args)
            if after_assess and result[0] is None:
                after_assess(module)
            return result

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, self.env, clear=True))
            stack.enter_context(patch.object(module, 'assess_run', assess))
            for name, value in patches.items():
                stack.enter_context(patch.object(module, name, value))
            return module, module.retention(apply=True)

    def outside_with_precious(self, run_id=None):
        outside = self.home / 'outside'
        precious = outside / (run_id or '') / 'node_modules/precious'
        precious.mkdir(parents=True)
        (precious / 'file').write_text('keep')
        return outside, precious / 'file'

    def assert_swap_refused(self, first, precious, report, moved_tree):
        row = self.row(report, first)
        self.assertEqual(row['status'], 'failed', row)
        self.assertIn('unverifiable', row['reason'])
        self.assertEqual(report['failed'], 1)
        self.assertEqual(precious.read_text(), 'keep')
        self.assertTrue((moved_tree / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_tree_replaced_by_symlink_after_assessment_deletes_nothing_outside(self):
        """The review's counterexample: rename the tree, symlink its path elsewhere."""
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        outside, precious = self.outside_with_precious()

        def swap(_module):
            tree.rename(tree.with_name(tree.name + '.moved'))
            tree.symlink_to(outside, target_is_directory=True)

        _module, report = self.retention_in_process(swap)
        self.assert_swap_refused(first, precious, report, tree.with_name(tree.name + '.moved'))

    def test_tree_replaced_by_real_directory_after_assessment_deletes_nothing(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        outside, precious = self.outside_with_precious()

        def swap(_module):
            tree.rename(tree.with_name(tree.name + '.moved'))
            outside.rename(tree)

        _module, report = self.retention_in_process(swap)
        self.assertIn('replaced since assessment', self.row(report, first)['reason'])
        self.assert_swap_refused(first, tree / 'node_modules/precious/file', report,
                                 tree.with_name(tree.name + '.moved'))

    def test_parent_of_runs_replaced_by_symlink_after_assessment_deletes_nothing(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        runs = tree.parent
        outside, precious = self.outside_with_precious(tree.name)

        def swap(_module):
            runs.rename(runs.with_name(runs.name + '.moved'))
            runs.symlink_to(outside, target_is_directory=True)

        _module, report = self.retention_in_process(swap)
        self.assert_swap_refused(first, precious, report,
                                 runs.with_name(runs.name + '.moved') / tree.name)

    def test_dependencies_replaced_by_symlink_after_assessment_deletes_nothing(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        outside, precious = self.outside_with_precious()

        def swap(_module):
            (tree / 'node_modules').rename(tree / 'node_modules.moved')
            (tree / 'node_modules').symlink_to(outside / 'node_modules', target_is_directory=True)

        _module, report = self.retention_in_process(swap)
        row = self.row(report, first)
        self.assertEqual(row['status'], 'failed', row)
        self.assertEqual(precious.read_text(), 'keep')
        self.assertTrue((tree / 'node_modules.moved/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_anchored_open_refuses_any_symlinked_component(self):
        """Even an alias of the same directory is refused, not just a foreign target."""
        module = self.subject()
        inner = self.home / 'real/inner'
        inner.mkdir(parents=True)
        (self.home / 'alias').symlink_to(self.home / 'real', target_is_directory=True)
        os.close(module.open_dir(inner))
        for path in (self.home / 'alias/inner', self.home / 'alias'):
            with self.subTest(path=path), self.assertRaises(OSError):
                module.open_dir(path)
        with self.assertRaises(module.Refused):
            module.open_dir(self.home / 'real/../real/inner')

    def test_in_process_prune_without_interference_succeeds(self):
        first, _second = self.two_runs()
        _module, report = self.retention_in_process()
        self.assertEqual(self.row(report, first)['status'], 'pruned')
        self.assertFalse(os.path.lexists(Path(first['tree']) / 'node_modules'))
        pruned = json.loads((Path(first['evidence']) / 'retention-pruned.json').read_text())
        tree_info = Path(first['tree']).lstat()
        self.assertEqual(pruned['tree_identity'], [tree_info.st_dev, tree_info.st_ino])

    def test_removal_is_bounded_by_the_deadline(self):
        """F5: removal itself stops at the deadline; the intent marker then forces review."""
        first, _second = self.two_runs()

        def expire(module):
            module.DEADLINE = time.monotonic() - 1

        _module, report = self.retention_in_process(expire)
        row = self.row(report, first)
        self.assertEqual(row['status'], 'failed', row)
        self.assertIn('deadline', row['reason'])
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        self.assertTrue((Path(first['evidence']) / 'retention-intent.json').exists())
        self.assertIn('interrupted', self.row(self.plan(), first)['reason'])

    # -- mounts (F2) ------------------------------------------------------

    BASE_MOUNTS = ('22 1 0:21 / / rw,relatime shared:1 - btrfs /dev/root rw\n'
                   '23 22 0:22 / /proc rw,nosuid shared:2 - proc proc rw\n')

    def mountinfo(self, extra='', name='mountinfo'):
        path = self.home / name
        path.write_text(self.BASE_MOUNTS + extra)
        return path

    def bad_tables(self):
        """One distinct file per malformed case, so no case overwrites another's fixture."""
        empty = self.home / 'mountinfo-empty'
        empty.write_text('')
        return [('missing', self.home / 'no-mountinfo'),
                ('empty', empty),
                ('truncated line', self.mountinfo('99 22 0:21 / /x rw\n', 'mountinfo-truncated')),
                ('no separator', self.mountinfo('99 22 0:21 / /x rw a b c d e\n',
                                                'mountinfo-no-separator'))]

    def test_same_device_bind_mount_inside_dependencies_keeps(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        (tree / 'node_modules/a b').mkdir()
        cases = {
            'bind mount, same device': f'99 22 0:21 /srv {tree}/node_modules/pkg rw shared:1 - btrfs /dev/root rw\n',
            'escaped mount point': f'99 22 0:21 /srv {tree}/node_modules/a\\040b rw - btrfs /dev/root rw\n',
            'mount on the tree': f'99 22 0:21 /srv {tree} rw - btrfs /dev/root rw\n',
        }
        for name, line in cases.items():
            with self.subTest(name):
                _module, report = self.retention_in_process(MOUNTINFO=self.mountinfo(line))
                row = self.row(report, first)
                self.assertEqual(row['status'], 'kept', row)
                self.assertIn('mount at or under the run tree', row['reason'])
                self.assertTrue((tree / 'node_modules/pkg/index.js').exists())
        # A mount elsewhere (even a sibling name prefix) does not block.
        sibling = f'99 22 0:21 /srv {tree}-sibling rw - btrfs /dev/root rw\n'
        _module, report = self.retention_in_process(MOUNTINFO=self.mountinfo(sibling))
        self.assertEqual(self.row(report, first)['status'], 'pruned')

    def test_unreadable_or_unparseable_mount_table_keeps(self):
        first, _second = self.two_runs()
        for name, path in self.bad_tables():
            with self.subTest(name):
                _module, report = self.retention_in_process(MOUNTINFO=path)
                row = self.row(report, first)
                self.assertEqual(row['status'], 'kept', row)
                self.assertIn('mount table', row['reason'])
                self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

    def test_mount_appearing_after_assessment_refuses_removal(self):
        first, _second = self.two_runs()
        tree = Path(first['tree'])
        table = self.mountinfo()

        def mount(_module):
            table.write_text(self.BASE_MOUNTS
                             + f'99 22 0:21 /srv {tree}/node_modules/pkg rw - btrfs /dev/root rw\n')

        _module, report = self.retention_in_process(mount, MOUNTINFO=table)
        row = self.row(report, first)
        self.assertEqual(row['status'], 'failed', row)
        self.assertTrue((tree / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())

    def test_descriptor_on_another_mount_inside_dependencies_keeps(self):
        """Mount ids from /proc/self/fdinfo catch a bind mount the walk opens."""
        first, _second = self.two_runs()
        module = self.subject()
        real = module.mount_id
        seen = []

        def mount_id(fd):
            seen.append(fd)
            # tree and node_modules agree; every deeper directory is "another mount".
            return real(fd) + (1 if len(seen) > 3 else 0)

        _module, report = self.retention_in_process(mount_id=mount_id)
        row = self.row(report, first)
        self.assertEqual(row['status'], 'kept', row)
        self.assertIn('mount inside dependencies', row['reason'])
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())

    # -- storage inventory mounts (admission) -----------------------------
    # The admission inventory shares retention's mount rules and fixtures.

    def inventory_fixture(self):
        """A run tree holding a directory that the fake mount table can call a bind mount."""
        runs = self.home / 'Work/Argus/src/policai-collection-runs'
        bound = runs / '20990101T000000Z-0000abcd/bound'
        bound.mkdir(parents=True)
        (bound / 'aliased.bin').write_bytes(b'x' * 50000)
        (runs / '20990101T000000Z-0000abcd/own.json').write_text('{}')
        evidence = self.state / 'policai-collection-runs'
        evidence.mkdir(parents=True)
        (evidence / 'receipt').write_text('{}')
        expected = sum(p.lstat().st_size for root in (runs, evidence)
                       for p in [root, *root.rglob('*')])
        return runs, bound, expected

    def inventory(self, deadline=60, **patches):
        """retained_bytes() and admission_guard() in-process, with patched mount state."""
        module = self.subject()
        module.DEADLINE = time.monotonic() + deadline
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, self.env, clear=True))
            for name, value in patches.items():
                stack.enter_context(patch.object(module, name, value))
            try:
                used = module.retained_bytes()
            except module.Refused as exc:
                with self.assertRaises(module.Refused):
                    module.admission_guard()  # the scheduled run refuses too
                return str(exc)
            return used

    def test_storage_inventory_never_counts_a_bind_mounted_subtree(self):
        """A same-device bind mount is invisible to st_dev/is_mount, so the table decides."""
        runs, bound, expected = self.inventory_fixture()
        before = self.snapshot_files(runs)
        cases = {
            'bind mount inside a run tree': f'99 22 0:21 /srv {bound} rw shared:1 - btrfs /dev/root rw\n',
            'escaped mount point': f'99 22 0:21 /srv {runs}/a\\040b rw - btrfs /dev/root rw\n',
            'mount on the storage root': f'99 22 0:21 /srv {runs} rw - btrfs /dev/root rw\n',
            'mount inside the evidence root':
                f'99 22 0:21 /srv {self.state}/policai-collection-runs/x rw - btrfs /dev/root rw\n',
        }
        for name, line in cases.items():
            with self.subTest(name):
                result = self.inventory(MOUNTINFO=self.mountinfo(line))
                self.assertIsInstance(result, str, 'mounted subtree was counted')
                self.assertIn('storage inventory mount boundary', result)
                self.assertIn('mount at or under the storage root', result)
        # Read-only, and a mount elsewhere (even a sibling name prefix) still counts once.
        self.assertEqual(self.snapshot_files(runs), before)
        sibling = f'99 22 0:21 /srv {runs}-sibling rw - btrfs /dev/root rw\n'
        self.assertEqual(self.inventory(MOUNTINFO=self.mountinfo(sibling)), expected)
        self.assertEqual(self.inventory(MOUNTINFO=self.mountinfo()), expected)

    def test_storage_inventory_refuses_a_directory_on_another_mount_id(self):
        """A mount the table did not show (or that appears mid-walk) is caught by fd mnt_id."""
        runs, bound, _expected = self.inventory_fixture()
        module = self.subject()
        real = module.mount_id
        roots = [runs.lstat(), (self.state / 'policai-collection-runs').lstat()]

        def mount_id(fd):
            # Each storage root agrees with itself; every deeper directory is "another mount".
            here = os.fstat(fd)
            return real(fd) + (0 if any(os.path.samestat(here, root) for root in roots) else 1)

        result = self.inventory(MOUNTINFO=self.mountinfo(), mount_id=mount_id)
        self.assertEqual(result, 'storage inventory mount boundary')
        self.assertTrue((bound / 'aliased.bin').exists())

    def test_storage_inventory_fails_closed_on_unknown_mount_state(self):
        _runs, _bound, _expected = self.inventory_fixture()
        for name, path in self.bad_tables():
            with self.subTest(name):
                result = self.inventory(MOUNTINFO=path)
                self.assertIsInstance(result, str, 'inventory accepted an unknown mount table')
                self.assertIn('storage inventory mount boundary: mount table', result)
        with self.subTest('descriptor mount id unreadable'):
            result = self.inventory(MOUNTINFO=self.mountinfo(), FDINFO=self.home / 'no-fdinfo')
            self.assertIn('descriptor mount identity unreadable', result)
        with self.subTest('deadline'):
            result = self.inventory(deadline=-1, MOUNTINFO=self.mountinfo())
            self.assertEqual(result, 'storage inventory deadline exceeded')

    # -- budget (F5) ------------------------------------------------------

    def slow_gh_view(self, url, seconds):
        bin_dir = self.home / '.local/bin'
        (bin_dir / 'gh').rename(bin_dir / 'gh-real')
        (bin_dir / 'gh').write_text(
            '#!/usr/bin/env python3\nimport os, sys, time\n'
            f'if sys.argv[1:4] == ["pr", "view", {url!r}]:\n    time.sleep({seconds})\n'
            f'os.execv({str(bin_dir / "gh-real")!r}, [{str(bin_dir / "gh-real")!r}] + sys.argv[1:])\n')
        (bin_dir / 'gh').chmod(0o755)

    def test_slow_retention_does_not_consume_the_collection_budget(self):
        """The review's end-to-end case: 3 s old-PR query, 2 s collection budget."""
        first, second = self.two_runs()
        self.slow_gh_view(first['pr'], 3)
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        self.env['POLICAI_COLLECT_MAX_SECONDS'] = '2'
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Retention:', result.stderr)
        self.assertNotIn('deadline exceeded', result.stderr)
        self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
        self.assertFalse((Path(first['tree']) / 'node_modules').exists())
        self.assertTrue((Path(second['tree']) / 'node_modules/pkg/index.js').exists())

    def test_retention_budget_is_bounded_and_keeps_on_expiry(self):
        first, _second = self.two_runs()
        self.slow_gh_view(first['pr'], 5)
        self.env['POLICAI_COLLECT_PRUNE_DEPENDENCIES'] = '1'
        self.env['POLICAI_COLLECT_RETENTION_SECONDS'] = '1'
        self.env['POLICAI_COLLECT_MAX_SECONDS'] = '2'
        started = time.monotonic()
        result = self.run_workflow()
        self.assertLess(time.monotonic() - started, 20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Retention:', result.stderr)
        self.assertEqual(self.receipt().get('skipped'), 'awaiting-review')
        self.assertTrue((Path(first['tree']) / 'node_modules/pkg/index.js').exists())
        self.assertFalse((Path(first['evidence']) / 'retention-intent.json').exists())
        for value in ['x', '-1']:
            with self.subTest(value=value):
                self.env['POLICAI_COLLECT_RETENTION_SECONDS'] = value
                result = self.run_workflow()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('Retention skipped', result.stderr)


if __name__ == '__main__':
    unittest.main()
