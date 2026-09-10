"""Compatibility entrypoint tests. Never invokes installed services."""

import importlib.util
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).parent


class CompatibilityTests(unittest.TestCase):
    def load(self):
        path = HERE / "policai-deploy.sh"
        self.assertTrue(path.is_file(), "new compatibility delegate has not been implemented")
        spec = importlib.util.spec_from_loader("compat", loader=None)
        mod = importlib.util.module_from_spec(spec)
        exec(compile(path.read_text(), str(path), "exec"), mod.__dict__)
        return mod

    def test_only_fixed_system_service_command_is_executed(self):
        m = self.load()
        with patch.object(
            m.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)
        ) as run:
            self.assertEqual(m.main([]), 0)
        args, kw = run.call_args
        self.assertEqual(
            args[0],
            [
                "/usr/bin/sudo",
                "--",
                "/usr/bin/systemctl",
                "start",
                "--wait",
                "policai-pull.service",
            ],
        )
        self.assertEqual(kw["timeout"], 3600)
        self.assertIs(kw["stdin"], subprocess.DEVNULL)
        self.assertIs(kw["stdout"], subprocess.DEVNULL)
        self.assertIs(kw["stderr"], subprocess.DEVNULL)
        self.assertFalse(kw.get("shell", False))
        self.assertNotIn("PYTHONPATH", kw["env"])

    def test_rejects_arguments_without_commands(self):
        m = self.load()
        with patch.object(m.subprocess, "run") as run:
            self.assertEqual(m.main(["--restart", "other.service"]), 2)
            self.assertEqual(m.main(["--help"]), 0)
        run.assert_not_called()

    def test_failed_or_timed_out_service_is_not_success(self):
        m = self.load()
        with patch.object(m.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
            self.assertEqual(m.main([]), 1)
        with patch.object(
            m.subprocess, "run", side_effect=subprocess.TimeoutExpired("sensitive", 3600)
        ):
            self.assertEqual(m.main([]), 1)

    def test_real_cli_help_and_rejection_have_no_side_effect(self):
        self.load()
        for args, status in [(["--help"], 0), (["--unsafe"], 2)]:
            result = subprocess.run(
                [sys.executable, "-I", str(HERE / "policai-deploy.sh"), *args],
                capture_output=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, status)


if __name__ == "__main__":
    unittest.main()
