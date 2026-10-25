import fcntl
import io
import json
import os
import tempfile
import unittest
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from test_transaction import FixtureState

import cli
import dispatcher as d
import host as h

COMPOSE = "/var/lib/probono-radar/app/apps/probono/docker-compose.yaml"
DUMP = ["compose", "-f", COMPOSE, "exec", "-T", "db", "pg_dump", "-U", "radar", "radar"]
FETCH = ["compose", "--profile", "worker", "run", "--rm", "worker", "src/fetch-all.ts"]
BLOCK = "persistent block: reviewed recovery required"


class Fixture(unittest.TestCase):
    def setUp(self):
        original = d.secure_path
        p = patch.object(
            d,
            "secure_path",
            side_effect=lambda path, owner=0, **kw: original(
                path, os.getuid(), **dict(kw, ancestors=False)
            ),
        )
        p.start()
        self.addCleanup(p.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = FixtureState(tmp.name)
        for name in ("deploy.lock", "worker.lock"):
            (self.state.root / name).touch()
        self.state.write("active.json", {"heads": {}, "target": "a" * 40})

    def block(self, **record):
        self.state.write(
            "blocked.json", {"id": "b" * 32, "phase": "failed-review-required", **record}
        )


class GuardTableTests(Fixture):
    def test_only_the_backups_run_without_a_ready_release(self):
        self.assertEqual(set(h.WORKER_GUARDS), {*h.WORKER_SCRIPTS, "neon-sync"})
        self.assertEqual(
            {name for name, guard in h.WORKER_GUARDS.items() if guard != "release"},
            {"backup", "backup-mirror", "neon-sync"},
        )
        self.assertEqual(h.compose_guard(DUMP), "database")
        self.assertEqual(h.compose_guard(FETCH), "release")
        with self.assertRaises(d.Refused):
            h.compose_guard(["compose", "down"])

    def test_a_persistent_block_refuses_release_workers_and_admits_backups(self):
        self.block(lanes=["policai"])
        with self.assertRaises(d.Refused) as caught:
            with h.worker_guard(self.state, "release"):
                self.fail("release worker must not pass a persistent block")
        self.assertEqual(str(caught.exception), BLOCK)
        for guard in ("database", "mirror"):
            self.state.acquired.clear()
            with self.subTest(guard), h.worker_guard(self.state, guard) as fds:
                self.assertEqual(len(fds), 2)
                self.assertEqual(
                    self.state.acquired, [("deploy.lock", False), ("worker.lock", True)]
                )

    def test_backups_run_before_the_first_activation(self):
        self.state.write(
            "active.json", {"heads": {}, "target": "a" * 40, "bootstrap_pending": True}
        )
        with self.assertRaises(d.Refused):
            with h.worker_guard(self.state, "release"):
                pass
        with h.worker_guard(self.state, "database"):
            pass

    def test_backups_still_wait_out_a_deployment_and_serialise_with_workers(self):
        self.block()
        fd = os.open(self.state.root / "deploy.lock", os.O_RDONLY)
        self.addCleanup(os.close, fd)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with self.assertRaises(d.Refused) as caught:
            with h.worker_guard(self.state, "database", wait=1):
                self.fail("a backup must not overlap a deploy or rollback")
        self.assertEqual(str(caught.exception), d.LOCK_BUSY["deploy.lock", False])
        fcntl.flock(fd, fcntl.LOCK_UN)
        with h.worker_guard(self.state, "mirror"):
            with self.assertRaises(d.Refused) as caught:
                with h.worker_guard(self.state, "database"):
                    pass
        self.assertEqual(str(caught.exception), d.LOCK_BUSY["worker.lock", True])


class HostCheckTests(unittest.TestCase):
    def host(self):
        obj = h.Host.__new__(h.Host)
        obj.checks, obj.runs = [], []

        class Run:
            def execute(self, argv, cwd, **kwargs):
                obj.runs.append(argv)
                return "PRIVATE OUTPUT"

        def release():
            obj.checks.append("release")
            raise d.Refused("worker source differs from active release")

        obj.runner = Run()
        obj.config = {
            "backup_mirror": {
                "source": "/srv/backups",
                "mount": "/mnt/second",
                "destination": "/mnt/second/b",
            }
        }
        obj.check_worker_identity = lambda: obj.checks.append("identity")
        obj.check_worker_release = release
        obj.verify_database = lambda: obj.checks.append("database")
        obj.validate_compose = lambda app, selection: obj.checks.append(("compose", selection))
        return obj

    def test_release_workers_still_need_the_active_release(self):
        for name in ("ingest", "enrich", "verify-deadlines"):
            obj = self.host()
            with self.subTest(name), self.assertRaises(d.Refused):
                obj.run_worker(name, ())
            self.assertEqual((obj.checks, obj.runs), (["identity", "release"], []))
        obj = self.host()
        with self.assertRaises(d.Refused):
            obj.worker_compose(FETCH, ())
        self.assertEqual((obj.checks, obj.runs), (["identity", "release"], []))

    def test_backup_proves_the_database_and_compose_instead_of_the_release(self):
        obj = self.host()
        obj.run_worker("backup", ())
        self.assertEqual(obj.checks, ["identity", "database", ("compose", "active")])
        self.assertEqual(obj.runs, [["/usr/bin/bash", str(h.CODE / "backup.sh")]])
        obj = self.host()
        self.assertEqual(obj.worker_compose(DUMP, ()), "PRIVATE OUTPUT")
        self.assertEqual(obj.checks, ["identity", "database", ("compose", "active")])
        self.assertEqual(obj.runs[0][-7:], DUMP[3:])

    def test_mirror_touches_no_release_or_docker_state(self):
        obj = self.host()
        obj.run_worker("backup-mirror", ())
        self.assertEqual(obj.checks, ["identity"])
        self.assertEqual(obj.runs, [["/usr/bin/bash", str(h.CODE / "backup-mirror.sh")]])

    def test_an_unknown_guard_fails_closed(self):
        obj = self.host()
        with self.assertRaises(d.Refused):
            obj.check_worker("none")


class CliRoutingTests(Fixture):
    def main(self, *argv):
        calls = []

        class FakeHost:
            def __init__(self, config, state):
                pass

            def run_worker(self, name, fds):
                calls.append(("worker", name, len(fds)))
                return "synced" if name == "neon-sync" else None

            def worker_compose(self, args, fds, payload):
                calls.append(("compose", args[3], len(fds)))
                return ""

        config = Path(self.state.root) / "config.json"
        config.write_text(
            json.dumps(
                {
                    "approved_target": "a" * 40,
                    "remote": "https://github.com/l0cka/policai.git",
                    "compose_sha256": "c" * 64,
                    "min_free_bytes": 2_000_000_000,
                    "db": {"id": "d" * 64, "image": "sha256:" + "e" * 64, "cluster": "1"},
                }
            )
        )
        with ExitStack() as stack:
            for target, name, value in (
                (cli, "ENTRYPOINT", Path(cli.__file__).resolve()),
                (cli, "trusted_entrypoint", lambda: None),
                (h, "CONFIG", config),
                (h, "STATE", self.state.root),
                (h, "Host", FakeHost),
                (d, "State", lambda root: self.state),
            ):
                stack.enter_context(patch.object(target, name, value))
            stack.enter_context(patch.object(cli.syslog, "syslog"))
            stack.enter_context(patch("sys.argv", ["cli.py", *argv]))
            err = stack.enter_context(redirect_stderr(io.StringIO()))
            out = stack.enter_context(redirect_stdout(io.StringIO()))
            code = cli.main()
        return code, calls, out.getvalue(), err.getvalue()

    def test_blocked_host_runs_backups_and_refuses_the_rest(self):
        self.block(lanes=["policai"])
        for operation in ("backup", "backup-mirror"):
            with self.subTest(operation):
                code, calls, out, err = self.main("worker", operation)
                self.assertEqual((code, err), (0, ""))
                self.assertEqual(calls, [("worker", operation, 2)])
                self.assertEqual(out, "scheduled operation completed\n")
        for operation in ("ingest", "enrich", "verify-deadlines"):
            with self.subTest(operation):
                code, calls, out, err = self.main("worker", operation)
                self.assertEqual((code, calls, out), (1, [], ""))
                self.assertTrue(err.startswith(f"Refused: {BLOCK}."), err)

    def test_neon_sync_runs_under_a_block_and_beside_a_running_worker(self):
        self.block(lanes=["policai"])
        with h.worker_guard(self.state, "database"):
            code, calls, out, err = self.main("worker", "neon-sync")
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(calls, [("worker", "neon-sync", 1)])
        self.assertEqual(out, "scheduled operation completed: synced\n")

    def test_blocked_host_admits_the_nested_dump_and_refuses_worker_tasks(self):
        self.block()
        code, calls, _, err = self.main("compose", "--", *DUMP)
        self.assertEqual((code, err, calls), (0, "", [("compose", "exec", 1)]))
        code, calls, _, err = self.main("compose", "--", *FETCH)
        self.assertEqual((code, calls), (1, []))
        self.assertTrue(err.startswith(f"Refused: {BLOCK}."), err)


if __name__ == "__main__":
    unittest.main()
