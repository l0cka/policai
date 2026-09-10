import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class HostContractTests(unittest.TestCase):
    def module(self):
        import host

        self.assertTrue(hasattr(host, "Host"), "production host implementation missing")
        return host

    def test_compose_overlay_and_exact_activation_argv(self):
        h = self.module()
        overlay = h.overlay("sha256:" + "1" * 64, "sha256:" + "2" * 64)
        self.assertEqual(
            overlay["volumes"]["pgdata"],
            {"external": True, "name": "probono-radar_pgdata"},
        )
        self.assertEqual(
            overlay["networks"]["default"],
            {"external": True, "name": "probono-radar_default"},
        )
        obj = h.Host.__new__(h.Host)
        command = obj.compose_argv(Path("/var/lib/probono-radar/app/apps/probono"), "active")
        self.assertIn("--env-file", command)
        self.assertIn("/etc/probono-radar/runtime.env", command)
        self.assertIn("--project-name", command)
        self.assertIn("probono-radar", command)
        self.assertNotIn("down", command)

    def test_health_semantics_reject_html_200_error_and_false_json(self):
        h = self.module()
        h.check_root_health('{"success":true,"collection":{"health":"healthy"}}')
        for text in ("{}", '{"success":false}', "<html>error</html>"):
            with self.assertRaises(h.Refused):
                h.check_root_health(text)
        h.check_child_health("<html><h1>Source health</h1><table></table></html>")
        for text in (
            "<html>error</html>",
            "<h1>Source health</h1>Internal Server Error",
        ):
            with self.assertRaises(h.Refused):
                h.check_child_health(text)

    def test_worker_compose_allowlist(self):
        h = self.module()
        good = [
            "compose",
            "--profile",
            "worker",
            "run",
            "--rm",
            "worker",
            "src/list-unenriched.ts",
        ]
        self.assertEqual(
            h.worker_arguments(good),
            [
                "run",
                "--no-deps",
                "--pull",
                "never",
                "--rm",
                "-T",
                "worker",
                "src/list-unenriched.ts",
            ],
        )
        for cmd in (
            ["compose", "down", "-v"],
            ["compose", "run", "worker", "src/digest.ts"],
            ["compose", "--profile", "worker", "run", "--rm", "worker", "/bin/sh"],
            [
                "compose",
                "--profile",
                "worker",
                "run",
                "--rm",
                "-v",
                "/:/host",
                "worker",
                "src/fetch-all.ts",
            ],
        ):
            with self.assertRaises(h.Refused):
                h.worker_arguments(cmd)

    def test_actual_compose_configuration_uses_external_resources(self):
        h = self.module()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            app = base / "app"
            app.mkdir()
            for child in ("dashboard", "worker"):
                (app / child).mkdir()
            source = """name: probono-radar
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    ports: ["127.0.0.1:5433:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  dashboard:
    build: ./dashboard
    ports: ["127.0.0.1:8850:3000"]
  worker:
    build: ./worker
    profiles: [worker]
    network_mode: host
volumes:
  pgdata:
"""
            (app / "docker-compose.yaml").write_text(source)
            env = base / "fixture.env"
            env.write_text("POSTGRES_PASSWORD=isolated-test-placeholder\n")
            (base / "candidate-compose.json").write_text(
                json.dumps(h.overlay("sha256:" + "1" * 64, "sha256:" + "2" * 64))
            )
            obj = h.Host.__new__(h.Host)
            obj.runner = h.Runner()
            obj.config = {"compose_sha256": hashlib.sha256(source.encode()).hexdigest()}
            # Parse real Compose configuration as the test runner. No daemon,
            # production account or identity transition is needed for this check.
            with (
                patch.object(h, "STATE", base),
                patch.object(h, "ENV_FILE", env),
                patch.object(
                    obj.runner, "identity_argv", side_effect=lambda identity, argv, extra_env: argv
                ) as identity,
            ):
                obj.validate_compose(app, "candidate")
            self.assertEqual(identity.call_args.args[0], "l0cka")

    def test_candidate_revision_and_source_digest_checks(self):
        h = self.module()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "docker-compose.yaml").write_text("name: test\n")
            digest = hashlib.sha256((base / "docker-compose.yaml").read_bytes()).hexdigest()
            h.check_compose_source(base, digest)
            with self.assertRaises(h.Refused):
                h.check_compose_source(base, "0" * 64)
            (base / "docker-compose.yaml").unlink()
            (base / "docker-compose.yaml").symlink_to("/etc/passwd")
            with self.assertRaises(h.Refused):
                h.check_compose_source(base, digest)
