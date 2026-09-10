"""Real Git fixtures only; no network, production checkout or service calls."""

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import host as h


class GitRecoveryTests(unittest.TestCase):
    def test_data_rollback_survives_interruption_after_each_git_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = {
                "PATH": "/usr/bin:/bin",
                "HOME": str(root),
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_AUTHOR_NAME": "Fixture",
                "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
                "GIT_COMMITTER_NAME": "Fixture",
                "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
                "GIT_AUTHOR_DATE": "2020-01-01T00:00:00+0000",
                "GIT_COMMITTER_DATE": "2020-01-01T00:00:00+0000",
            }

            def git(repo, *args):
                return subprocess.run(
                    ["/usr/bin/git", "-c", "core.hooksPath=/dev/null", *args],
                    cwd=repo,
                    env=env,
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=10,
                ).stdout.strip()

            bases = {lane: root / lane for lane in h.BASES}
            old, new = {}, {}
            for lane, base in bases.items():
                app = base / "app"
                app.mkdir(parents=True)
                git(app, "init", "-b", "main")
                (app / "data.json").write_text("old\n")
                git(app, "add", "data.json")
                git(app, "commit", "-m", "baseline")
                old[lane] = git(app, "rev-parse", "HEAD")
                (app / "data.json").write_text("new\n")
                git(app, "commit", "-am", "candidate")
                new[lane] = git(app, "rev-parse", "HEAD")
            self.assertEqual(len(set(new.values())), 1)
            record = {
                "id": "1" * 32,
                "previous": old,
                "target": new["policai"],
                "lanes": [],
                "activation_started": True,
            }
            obj = h.Host.__new__(h.Host)
            obj.checkpoint = lambda phase: None

            def check_repo(lane):
                app = bases[lane] / "app"
                self.assertEqual(
                    git(app, "rev-parse", "--abbrev-ref", "HEAD"),
                    "main",
                    "interrupted rollback must leave a repeatable main checkout",
                )
                self.assertEqual(git(app, "status", "--porcelain"), "")
                return git(app, "rev-parse", "HEAD")

            obj.check_repo = check_repo
            mutation_count = 0

            def interrupted_git(lane, *args, **kwargs):
                nonlocal mutation_count
                result = git(bases[lane] / "app", *args)
                if args[0] == "switch":
                    mutation_count += 1
                    # Simulate process death after the actual Git mutation.
                    raise InterruptedError("fixture crash after Git switch")
                return result

            obj.git = interrupted_git
            with patch.object(h, "BASES", bases):
                for _ in bases:
                    with self.assertRaises(InterruptedError):
                        obj.rollback(record)
                obj.rollback(record)
                obj.rollback(record)
                for lane in bases:
                    self.assertEqual(check_repo(lane), old[lane])
                    self.assertEqual((bases[lane] / "app/data.json").read_text(), "old\n")
            self.assertEqual(mutation_count, len(bases))
