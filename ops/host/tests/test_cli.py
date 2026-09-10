import subprocess
import sys
import unittest
from pathlib import Path


class CliTests(unittest.TestCase):
    def test_only_exact_public_readonly_remote_is_accepted(self):
        import cli

        self.assertTrue(hasattr(cli, "validate_remote"), "public remote validation missing")
        remote = "https://github.com/l0cka/policai.git"
        self.assertEqual(cli.validate_remote(remote), remote)
        for invalid in (
            "git@github.com:l0cka/policai.git",
            "https://user:credential@github.com/l0cka/policai.git",
            "https://github.com/l0cka/policai.git?credential=value",
            "https://github.com/l0cka/policai.git/",
            "https://github.com/other/repository.git",
            "http://github.com/l0cka/policai.git",
            "https://github.com.evil.invalid/l0cka/policai.git",
            None,
        ):
            with self.subTest(remote=invalid), self.assertRaises(RuntimeError):
                cli.validate_remote(invalid)

    def test_help_and_uninstalled_refusal_execute_no_commands(self):
        cli = Path(__file__).resolve().parents[1] / "cli.py"
        self.assertTrue(cli.is_file(), "executable CLI missing")
        help = subprocess.run(
            [sys.executable, "-I", str(cli), "--help"], capture_output=True, text=True
        )
        self.assertEqual(help.returncode, 0, help.stderr)
        for name in ("initialize", "deploy", "rollback", "status", "worker", "compose"):
            self.assertIn(name, help.stdout)
        denied = subprocess.run(
            [sys.executable, "-I", str(cli), "deploy"], capture_output=True, text=True
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("installed root-owned entrypoint", denied.stderr)

    def test_system_helper_refuses_arguments_before_delegation(self):
        path = Path(__file__).resolve().parents[1] / "policai-deploy"
        self.assertTrue(path.is_file(), "system helper missing")
        result = subprocess.run(
            ["/usr/bin/bash", str(path), "unexpected"], capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 64)
        self.assertIn("/usr/local/libexec/policai-host/cli.py deploy", path.read_text())


if __name__ == "__main__":
    unittest.main()
