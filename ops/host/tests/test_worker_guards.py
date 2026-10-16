import fcntl
import io
import os
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

from test_transaction import FakeClock, FixtureState

import cli
import dispatcher as d
import host as h

HOST = Path(__file__).resolve().parent.parent
COMPOSE = "/var/lib/probono-radar/app/apps/probono/docker-compose.yaml"
EXEC = ["compose", "-f", COMPOSE, "exec", "-T", "db"]
GLOBALS = ["pg_dumpall", "-U", "radar", "--globals-only"]


class GlobalsDumpAllowlistTests(unittest.TestCase):
    def test_exact_globals_dump_is_accepted(self):
        self.assertEqual(
            h.worker_arguments([*EXEC, *GLOBALS]),
            ["exec", "-T", "db", "pg_dumpall", "-U", "radar", "--globals-only"],
        )

    def test_every_variant_of_the_globals_dump_is_refused(self):
        variants = {
            "extra flag": [*EXEC, *GLOBALS, "--clean"],
            "other user": [*EXEC, "pg_dumpall", "-U", "postgres", "--globals-only"],
            "globals-only missing": [*EXEC, "pg_dumpall", "-U", "radar"],
            "flag order": [*EXEC, "pg_dumpall", "--globals-only", "-U", "radar"],
            "joined user flag": [*EXEC, "pg_dumpall", "-Uradar", "--globals-only"],
            "joined arguments": [*EXEC, "pg_dumpall", "-U", "radar --globals-only"],
            "different binary pg_dump": [*EXEC, "pg_dump", "-U", "radar", "--globals-only"],
            "different binary psql": [*EXEC, "psql", "-U", "radar", "--globals-only"],
            "shell wrapper": [*EXEC, "sh", "-c", "pg_dumpall -U radar --globals-only"],
            "extra positional": [*EXEC, *GLOBALS, "radar"],
            "file injection": [*EXEC, *GLOBALS, "--file=/tmp/roles.sql"],
            "token injection": [*EXEC, "pg_dumpall", "-U", "radar", "--globals-only;id"],
            "other service": [
                "compose",
                "-f",
                COMPOSE,
                "exec",
                "-T",
                "dashboard",
                *GLOBALS,
            ],
            "tty allocated": ["compose", "-f", COMPOSE, "exec", "db", *GLOBALS],
            "other compose file": [
                "compose",
                "-f",
                "/tmp/docker-compose.yaml",
                "exec",
                "-T",
                "db",
                *GLOBALS,
            ],
        }
        for name, args in variants.items():
            with self.subTest(name), self.assertRaises(d.Refused):
                h.worker_arguments(args)


class BackupSequenceTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.out = self.root / "out"
        self.out.mkdir()
        self.log = self.root / "docker.log"
        source = (HOST / "backup.sh").read_text()
        line = "OUT=/home/l0cka/Backups/probono-radar\n"
        self.assertEqual(source.count(line), 1, "backup.sh output path moved")
        self.script = self.root / "backup.sh"
        self.script.write_text(source.replace(line, f"OUT={self.out}\n"))
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        docker = bin_dir / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import os, sys\n"
            f"sys.path.insert(0, {str(HOST)!r})\n"
            "import host\n"
            f"log = open({str(self.log)!r}, 'a')\n"
            "try:\n"
            "    allowed = host.worker_arguments(sys.argv[1:])\n"
            "except host.Refused as error:\n"
            "    print('refused', error, file=log)\n"
            "    sys.exit(1)\n"
            "print(' '.join(allowed), file=log)\n"
            "if allowed[3] == os.environ.get('FAKE_FAIL'):\n"
            "    sys.exit(1)\n"
            "if allowed[3] == 'pg_dump':\n"
            "    sys.stdout.write('-- PostgreSQL database dump\\n' + os.urandom(20000).hex()"
            " + '\\n-- PostgreSQL database dump complete\\n')\n"
            "else:\n"
            "    sys.stdout.write('CREATE ROLE radar;\\n')\n"
        )
        docker.chmod(0o755)
        self.path = f"{bin_dir}:/usr/bin:/bin"
        old = time.time() - 30 * 86400
        for day in range(1, 8):
            for series in ("radar", "globals"):
                path = self.out / f"{series}-2026-09-0{day}.sql.gz"
                path.write_bytes(b"old")
                os.utime(path, (old + day, old + day))

    def backup(self, **env):
        return subprocess.run(
            ["/usr/bin/bash", str(self.script)],
            env={"PATH": self.path, "LANG": "C.UTF-8", **env},
            capture_output=True,
            text=True,
            timeout=60,
        )

    def series(self, name):
        return sorted(p.name for p in self.out.glob(f"{name}-*.sql.gz"))

    def test_full_sequence_passes_the_guard_and_rotates_after_the_globals_dump(self):
        run = self.backup()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stdout, "backup verified\n")
        self.assertEqual(
            self.log.read_text().splitlines(),
            [
                "exec -T db pg_dump -U radar radar",
                "exec -T db pg_dumpall -U radar --globals-only",
            ],
        )
        stamp = time.strftime("%Y-%m-%d", time.gmtime())
        for name in ("radar", "globals"):
            kept = self.series(name)
            self.assertEqual(len(kept), 5, kept)
            self.assertIn(f"{name}-{stamp}.sql.gz", kept)
            self.assertNotIn(f"{name}-2026-09-01.sql.gz", kept)
        self.assertEqual((self.out / f"globals-{stamp}.sql.gz").stat().st_mode & 0o777, 0o600)
        self.assertEqual(list(self.out.glob(".*")), [])

    def test_failed_globals_dump_fails_closed_without_rotation(self):
        run = self.backup(FAKE_FAIL="pg_dumpall")
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(len(self.series("radar")), 8)
        self.assertEqual(len(self.series("globals")), 7)
        self.assertEqual(list(self.out.glob(".*")), [])


class LockWaitTests(unittest.TestCase):
    def setUp(self):
        original = d.secure_path
        p = patch.object(
            d,
            "secure_path",
            side_effect=lambda *a, **kw: original(*a, **dict(kw, ancestors=False)),
        )
        p.start()
        self.addCleanup(p.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = FixtureState(tmp.name)
        for name in ("deploy.lock", "worker.lock"):
            (self.state.root / name).touch()
        self.state.write("active.json", {"ready": True})

    def hold(self, name="deploy.lock"):
        fd = os.open(self.state.root / name, os.O_RDONLY)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.addCleanup(os.close, fd)
        return fd

    def test_worker_waits_for_a_pull_and_acquires_when_it_releases(self):
        holder = self.hold()
        fake = FakeClock(on_sleep=lambda count: count == 3 and fcntl.flock(holder, fcntl.LOCK_UN))
        with h.worker_guard(self.state, clock=fake.clock, sleep=fake.sleep) as fds:
            self.assertEqual(len(fds), 2)
        self.assertEqual(len(fake.sleeps), 3)

    def test_worker_refuses_when_the_lock_never_frees(self):
        self.hold()
        fake = FakeClock()
        with self.assertRaises(d.Refused) as caught:
            with h.worker_guard(self.state, wait=2, clock=fake.clock, sleep=fake.sleep):
                self.fail("guard must not yield while a deployment holds the lock")
        self.assertIn("deployment", str(caught.exception))
        self.assertGreaterEqual(fake.now - 1000.0, 2)
        self.assertLess(fake.now - 1000.0, 2 + d.LOCK_POLL_SECONDS + 1e-9)

    def test_default_wait_covers_a_pull(self):
        self.assertEqual(h.WORKER_LOCK_WAIT_SECONDS, 120)

    def test_deploy_and_rollback_refuse_at_once_while_a_worker_holds_the_lock(self):
        busy = d.LOCK_BUSY["deploy.lock", True]
        transaction = d.Transaction(self.state, None)
        with h.worker_guard(self.state, clock=self.state.fake.clock, sleep=self.state.fake.sleep):
            for name, call in (
                ("deploy", lambda: transaction.deploy(None)),
                ("rollback", transaction.rollback),
            ):
                with self.subTest(name), self.assertRaises(d.Refused) as caught:
                    call()
                self.assertEqual(str(caught.exception), busy)
        self.assertEqual(self.state.fake.sleeps, [])

    def test_worker_takes_deploy_lock_before_worker_lock(self):
        with h.worker_guard(self.state):
            self.assertEqual(self.state.acquired, [("deploy.lock", False), ("worker.lock", True)])
        self.state.acquired.clear()
        with h.worker_guard(self.state, serialize=False):
            self.assertEqual(self.state.acquired, [("deploy.lock", False)])

    def test_a_second_worker_is_refused_with_its_own_reason(self):
        with h.worker_guard(self.state):
            with self.assertRaises(d.Refused) as caught:
                with h.worker_guard(self.state):
                    pass
        self.assertIn("worker", str(caught.exception))
        self.assertNotIn("deployment", str(caught.exception))


class FailureLineTests(unittest.TestCase):
    def worker(self, runner):
        obj = h.Host.__new__(h.Host)
        obj.runner = runner
        obj.check_worker_identity = lambda: None
        obj.check_worker_release = lambda: None
        return obj

    def failure(self, call):
        try:
            call()
        except (RuntimeError, OSError, ValueError, KeyError, TypeError) as error:
            return cli.failure_line(error)
        self.fail("expected a refusal")

    def test_task_exit_after_passing_guards_is_reported_as_a_task_failure(self):
        class Failing:
            def execute(self, argv, cwd, **kwargs):
                return h.Runner().execute([sys.executable, "-c", "raise SystemExit(3)"], cwd="/")

        line = self.failure(lambda: self.worker(Failing()).run_worker("verify-deadlines", ()))
        self.assertTrue(line.startswith("Failed: worker task verify-deadlines"), line)
        self.assertIn("exited with status 3", line)
        self.assertIn("guards passed", line)

    def test_a_spawned_task_that_times_out_is_a_task_failure(self):
        class Slow:
            def execute(self, argv, cwd, **kwargs):
                sleeper = [sys.executable, "-c", "import time; time.sleep(30)"]
                return h.Runner().execute(sleeper, cwd="/", timeout=0.2)

        line = self.failure(lambda: self.worker(Slow()).run_worker("verify-deadlines", ()))
        self.assertEqual(
            line,
            "Failed: worker task verify-deadlines: command timed out; guards passed."
            " No automatic retry.",
        )

    def test_a_runner_refusal_before_spawn_is_a_refusal(self):
        class Oversized:
            def execute(self, argv, cwd, **kwargs):
                argv = [sys.executable, "-c", "raise SystemExit(0)"]
                return h.Runner().execute(argv, cwd="/", stdin_data=b"x" * 262145)

        run = ["compose", "--profile", "worker", "run", "--rm", "worker"]
        task = [*run, "src/save-enrichment.ts", "1"]
        line = self.failure(lambda: self.worker(Oversized()).worker_compose(task, (), b"{}"))
        self.assertEqual(
            line,
            "Refused: command input exceeds bound."
            " Inspect status and reviewed prerequisites; no automatic retry.",
        )

    def test_each_guard_refusal_names_its_guard(self):
        obj = self.worker(None)

        def release():
            raise d.Refused("worker source differs from active release")

        obj.check_worker_release = release
        cases = {
            "worker source differs from active release": lambda: obj.run_worker("ingest", ()),
            "scheduled command out of scope": lambda: obj.run_worker("digest", ()),
            "worker command not allowlisted": lambda: h.worker_arguments(["compose", "down"]),
        }
        lines = set()
        for reason, call in cases.items():
            line = self.failure(call)
            self.assertTrue(line.startswith(f"Refused: {reason}."), line)
            lines.add(line)
        self.assertEqual(len(lines), len(cases))

    def test_compose_task_failure_names_the_allowlisted_task(self):
        class Failing:
            def execute(self, argv, cwd, **kwargs):
                raise h.ProcessFailed("command exited with status 1")

        run = ["compose", "--profile", "worker", "run", "--rm", "worker"]
        line = self.failure(
            lambda: self.worker(Failing()).worker_compose([*run, "src/verify-deadlines.ts"], ())
        )
        self.assertTrue(line.startswith("Failed: worker task src/verify-deadlines.ts"), line)
        line = self.failure(lambda: self.worker(Failing()).worker_compose([*EXEC, *GLOBALS], ()))
        self.assertTrue(line.startswith("Failed: worker task pg_dumpall"), line)

    def test_unexpected_errors_report_only_their_type(self):
        line = cli.failure_line(KeyError("VERIFIER_API_KEY=not-for-logs"))
        self.assertIn("KeyError", line)
        self.assertNotIn("VERIFIER", line)

    def test_nested_compose_failure_reaches_the_journal(self):
        error = d.Refused("worker command not allowlisted")
        with patch.object(cli.syslog, "syslog") as journal, redirect_stderr(io.StringIO()) as err:
            cli.report("compose", error)
            cli.report("worker", error)
        self.assertEqual(err.getvalue().count("Refused: worker command not allowlisted"), 2)
        self.assertEqual(len(journal.call_args_list), 1)
        self.assertIn("worker command not allowlisted", journal.call_args.args[1])

    def test_a_line_that_cannot_be_built_falls_back_to_a_fixed_line(self):
        error = RuntimeError("unsafe installed root-owned entrypoint")
        with patch.dict(sys.modules, {"host": None}), redirect_stderr(io.StringIO()) as err:
            cli.report("worker", error)
        self.assertEqual(
            err.getvalue(),
            "Refused: failure report unavailable."
            " Inspect status and reviewed prerequisites; no automatic retry.\n",
        )

    def test_a_journal_failure_keeps_the_stderr_line(self):
        error = d.Refused("worker command not allowlisted")
        down = OSError("journal unavailable")
        with (
            patch.object(cli.syslog, "openlog"),
            patch.object(cli.syslog, "syslog", side_effect=down),
            redirect_stderr(io.StringIO()) as err,
        ):
            cli.report("compose", error)
        self.assertEqual(
            err.getvalue(),
            "Refused: worker command not allowlisted."
            " Inspect status and reviewed prerequisites; no automatic retry.\n",
        )


if __name__ == "__main__":
    unittest.main()
