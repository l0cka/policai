import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dispatcher as d
import host as h

HOST = "ep-quiet-sea-a1b2c3d4.ap-southeast-2.aws.neon.tech"
URL = f"postgresql://neondb_owner:s3cret%2Fpass@{HOST}/neondb?sslmode=require"


class NeonEnvironmentTests(unittest.TestCase):
    def test_parses_the_direct_endpoint(self):
        text = f"# copy for the A2J site\nNEON_DATABASE_URL={URL}\nNEON_POOLED_URL=ignored\n"
        self.assertEqual(
            h.neon_environment(text),
            {
                "NEON_HOST": HOST,
                "NEON_USER": "neondb_owner",
                "NEON_PASSWORD": "s3cret/pass",
                "NEON_DATABASE": "neondb",
            },
        )

    def test_refuses_anything_but_one_direct_neon_url(self):
        pooled = URL.replace(".ap-southeast-2", "-pooler.ap-southeast-2")
        for text in (
            "",
            f"NEON_DATABASE_URL={URL}\nNEON_DATABASE_URL={URL}\n",
            f"NEON_DATABASE_URL={pooled}\n",
            f"NEON_DATABASE_URL={URL.replace(HOST, 'db.example.com')}\n",
            f"NEON_DATABASE_URL={URL.replace(HOST, HOST + '.example.com')}\n",
            f"NEON_DATABASE_URL={URL.replace(HOST, HOST + ':6543')}\n",
            f"NEON_DATABASE_URL={URL.replace('postgresql', 'http')}\n",
            f"NEON_DATABASE_URL={URL.replace(':s3cret%2Fpass', '')}\n",
            f"NEON_DATABASE_URL={URL.replace('/neondb?', '/neon;db?')}\n",
            f"NEON_DATABASE_URL={URL.replace('neondb_owner', 'x y')}\n",
        ):
            with self.subTest(text=text), self.assertRaises(d.Refused):
                h.neon_environment(text)


class NeonSyncTests(unittest.TestCase):
    def host(self, events):
        obj = h.Host.__new__(h.Host)

        class Run:
            def execute(self, argv, cwd, **kwargs):
                events.append((argv, kwargs))
                return "synced\n"

        obj.runner = Run()
        obj.check_worker_identity = lambda: None
        obj.check_worker_release = lambda: self.fail("neon-sync must not need a release")
        obj.check_worker_database = lambda: events.append("database checked")
        obj.compose_argv = lambda app, which: ["docker", "compose", which]
        return obj

    def run_sync(self, mode, events):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "neon.env"
            env.write_text(f"NEON_DATABASE_URL={URL}\n")
            env.chmod(mode)
            with (
                patch.object(h, "NEON_ENV_FILE", env),
                patch.object(h, "secure_path", side_effect=lambda path: path.lstat()),
            ):
                return self.host(events).run_worker("neon-sync", (99,))

    def test_execs_the_fixed_script_in_the_db_container_with_the_password_on_stdin(self):
        events = []
        self.assertEqual(self.run_sync(0o640, events), "synced")
        self.assertEqual(events[0], "database checked")
        argv, kwargs = events[1]
        self.assertEqual(
            argv,
            [
                "docker", "compose", "active", "exec", "-T",
                "-e", "NEON_HOST", "-e", "NEON_USER", "-e", "NEON_DATABASE",
                "db", "sh", "-c", h.NEON_SYNC_SCRIPT,
            ],
        )  # fmt: skip
        self.assertEqual(kwargs["identity"], "l0cka")
        self.assertEqual(kwargs["pass_fds"], (99,))
        self.assertEqual(
            kwargs["extra_env"],
            {"NEON_HOST": HOST, "NEON_USER": "neondb_owner", "NEON_DATABASE": "neondb"},
        )
        self.assertEqual(kwargs["stdin_data"], b"s3cret/pass\n")
        self.assertNotIn("s3cret", " ".join(argv))

    def test_refuses_a_world_readable_environment_file(self):
        events = []
        with self.assertRaises(d.Refused):
            self.run_sync(0o644, events)
        self.assertEqual(events, ["database checked"])


@unittest.skipUnless(Path("/usr/bin/bash").exists(), "needs bash for pipefail")
class NeonSyncScriptTests(unittest.TestCase):
    """Run the container script against stub pg_dump and psql."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (self.root / "rows").write_text("row 1\n")
        stubs = {
            # Shaped like pg_dump 16.15: a fresh \restrict key every run, and
            # \unrestrict plus blank lines after the completion line.
            "pg_dump": f"""#!/bin/sh
printf '\\\\restrict %s\\n' $$
cat {self.root}/rows
[ -e {self.root}/truncate ] && exit 0
echo '-- PostgreSQL database dump complete'
echo
printf '\\\\unrestrict %s\\n' $$
echo
""",
            "psql": f"""#!/bin/sh
[ "$PGPASSWORD" = s3cret ] || exit 9
[ "$PGSSLMODE" = verify-full ] || exit 9
cat > {self.root}/sent
[ -e {self.root}/psql-fails ] && exit 3
exit 0
""",
        }
        for name, body in stubs.items():
            (bin_dir / name).write_text(body)
            (bin_dir / name).chmod(0o755)
        self.script = h.NEON_SYNC_SCRIPT.replace("/tmp/", f"{self.root}/")
        self.env = {
            "PATH": f"{bin_dir}:/usr/bin:/bin",
            "NEON_HOST": HOST,
            "NEON_USER": "neondb_owner",
            "NEON_DATABASE": "neondb",
        }

    def sync(self):
        return subprocess.run(
            ["/usr/bin/bash", "-c", self.script],
            input="s3cret\n",
            env=self.env,
            capture_output=True,
            text=True,
        )

    def test_replaces_the_copy_only_when_the_dump_changes(self):
        first = self.sync()
        self.assertEqual((first.returncode, first.stdout), (0, "synced\n"), first.stderr)
        sent = (self.root / "sent").read_text()
        self.assertTrue(sent.startswith("DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA"))
        self.assertIn("row 1\n", sent)
        (self.root / "sent").unlink()

        self.assertEqual(self.sync().stdout, "unchanged\n")
        self.assertFalse((self.root / "sent").exists())

        (self.root / "rows").write_text("row 1\nrow 2\n")
        self.assertEqual(self.sync().stdout, "synced\n")
        self.assertIn("row 2\n", (self.root / "sent").read_text())
        self.assertEqual(
            sorted(p.name for p in self.root.glob("neon-sync.*")), ["neon-sync.sha256"]
        )

    def test_never_sends_an_incomplete_dump(self):
        (self.root / "truncate").touch()
        result = self.sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "sent").exists())
        self.assertFalse((self.root / "neon-sync.sha256").exists())

    def test_a_failed_copy_is_retried_next_run(self):
        (self.root / "psql-fails").touch()
        self.assertNotEqual(self.sync().returncode, 0)
        self.assertFalse((self.root / "neon-sync.sha256").exists())
        os.unlink(self.root / "psql-fails")
        self.assertEqual(self.sync().stdout, "synced\n")


if __name__ == "__main__":
    unittest.main()
