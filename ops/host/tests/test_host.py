import importlib.util
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class AdapterTests(unittest.TestCase):
    def host(self):
        self.assertIsNotNone(importlib.util.find_spec("host"), "bounded host adapter missing")
        import host

        return host

    def test_actual_subprocess_has_sanitized_environment_and_generic_errors(self):
        h = self.host()
        with tempfile.TemporaryDirectory() as tmp:
            r = h.Runner()
            out = r.execute(
                [
                    sys.executable,
                    "-I",
                    "-c",
                    'import os; print(os.getenv("DANGEROUS_TEST", "absent"))',
                ],
                Path(tmp),
                timeout=2,
            )
            self.assertEqual(out.strip(), "absent")
            with self.assertRaisesRegex(h.Refused, "^command failed$"):
                r.execute(
                    [
                        sys.executable,
                        "-I",
                        "-c",
                        'import sys;print("secret");sys.exit(7)',
                    ],
                    Path(tmp),
                    timeout=2,
                )

    def test_actual_timeout_and_output_limit(self):
        h = self.host()
        with tempfile.TemporaryDirectory() as tmp:
            r = h.Runner()
            start = time.monotonic()
            with self.assertRaises(h.Refused):
                r.execute(
                    [sys.executable, "-I", "-c", "import time;time.sleep(30)"],
                    Path(tmp),
                    timeout=0.1,
                )
            self.assertLess(time.monotonic() - start, 3)
            with self.assertRaises(h.Refused):
                r.execute(
                    [sys.executable, "-I", "-c", 'print("X" * 20000)'],
                    Path(tmp),
                    timeout=2,
                    limit=100,
                )

    def test_identity_is_explicit_and_no_root_npm(self):
        h = self.host()
        r = h.Runner()
        # Exercise the identity transition without requiring production accounts
        # on the CI runner or developer machine.
        with patch.object(h.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.geteuid() + 1)):
            root = r.identity_argv("policai", ["/usr/bin/npm", "run", "build"])
        self.assertIn("policai", root)
        self.assertEqual(root[0], "/usr/bin/runuser")
        with self.assertRaises(h.Refused):
            r.identity_argv("root", ["/usr/bin/npm", "run", "build"])
        with self.assertRaises(h.Refused):
            r.identity_argv("unknown-user", ["/usr/bin/git", "status"])

    def test_deploy_clients_keep_state_outside_protected_home(self):
        h = self.host()
        calls = []

        class RecordingRunner:
            def execute(self, argv, cwd, **kwargs):
                calls.append((argv, kwargs))
                return ""

        obj = h.Host({}, state=object(), runner=RecordingRunner())
        obj.git("probono", "status")
        obj.docker("version")
        obj.compose(Path("/var/lib/probono-radar/app/apps/probono"), "active", "config")
        for argv, kwargs in calls:
            self.assertEqual(kwargs.get("extra_env", {}).get("HOME"), "/var/lib/probono-radar")
            if argv[0] == "/usr/bin/docker":
                self.assertEqual(
                    kwargs["extra_env"]["DOCKER_CONFIG"], "/var/lib/probono-radar/.docker"
                )
        self.assertIn("credential.helper=", calls[0][0])
        self.assertIn("http.extraHeader=", calls[0][0])
        # Claude workers still use their existing authenticated user context.
        with patch.object(h.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.geteuid())):
            worker = h.Runner().identity_argv("l0cka", ["/usr/bin/true"])
        self.assertEqual(worker[0], "/usr/bin/env")
        self.assertIn("HOME=/home/l0cka", worker)

    def test_user_unit_observation_uses_service_private_alias(self):
        h = self.host()
        self.assertTrue(hasattr(h, "user_unit_directory"), "sandbox unit observation missing")
        with tempfile.TemporaryDirectory() as tmp:
            canonical = Path(tmp) / "home-units"
            alias = Path(tmp) / "run-view"
            canonical.mkdir()
            with patch.object(h, "USER_UNITS", canonical), patch.object(h, "UNIT_VIEW", alias):
                self.assertEqual(h.user_unit_directory(), canonical)
                alias.mkdir()
                self.assertEqual(h.user_unit_directory(), alias)

    def test_production_path_validator_rejects_group_writable_and_symlink(self):
        import dispatcher as d

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "file"
            p.write_text("")
            p.chmod(0o666)
            with self.assertRaises(d.Refused):
                d.secure_path(p, os.getuid(), ancestors=False)
            p.chmod(0o600)
            link = Path(tmp) / "alias"
            link.symlink_to(p)
            with self.assertRaises(d.Refused):
                d.secure_path(link, os.getuid(), ancestors=False)
