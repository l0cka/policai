import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import host


class RuntimeTransitions(unittest.TestCase):
    def exercise(self, sockets, services=None, images=None, states=None, fail=False):
        image = "sha256:" + "a" * 64
        active = {"root_build": "fixture", "images": {"dashboard": image, "worker": image}}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app/.next").mkdir(parents=True)
            (root / "app/.next/BUILD_ID").write_text("fixture")
            obj = host.Host.__new__(host.Host)
            obj.verify_database = Mock()
            obj.system = Mock(side_effect=services or ["active"] * 30)
            obj.docker = Mock(return_value=image)
            snapshots = []
            for i in range(30):
                snapshots.append(
                    {
                        "State": {
                            "Status": (states or ["running"] * 30)[min(i, len(states or []) - 1)]
                            if states
                            else "running"
                        },
                        "Image": images[min(i, len(images) - 1)] if images else image,
                        "NetworkSettings": {
                            "Ports": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8850"}]}
                        },
                        "Config": {"Labels": {"com.docker.compose.project": "probono-radar"}},
                    }
                )
            obj.inspect_container = Mock(side_effect=snapshots)
            obj.runner = Mock()
            obj.runner.execute.side_effect = sockets
            with (
                patch.object(host, "BASES", {"policai": root}),
                patch.object(host, "secure_path"),
                patch.object(host.time, "sleep") as sleep,
            ):
                if fail:
                    with self.assertRaises(host.Refused):
                        obj.wait_for_runtime(active)
                else:
                    obj.wait_for_runtime(active)
            return obj.runner.execute.call_count, sleep.call_count

    @staticmethod
    def sockets(root="127.0.0.1:8794"):
        addresses = [root, "127.0.0.1:8850", "127.0.0.1:5433"]
        return "\n".join("LISTEN 0 10 " + a + " 0.0.0.0:*" for a in addresses if a)

    def test_real_absent_listener_then_ready(self):
        self.assertEqual(self.exercise([self.sockets(""), self.sockets()]), (2, 1))

    def test_real_service_and_container_startup_then_ready(self):
        self.assertEqual(
            self.exercise(
                [self.sockets(), self.sockets()],
                services=["activating", "active"],
                states=["restarting", "running"],
            ),
            (2, 1),
        )

    def test_real_wildcard_listener_is_immediate_failure(self):
        self.assertEqual(self.exercise([self.sockets("0.0.0.0:8794")], fail=True), (1, 0))

    def test_real_wrong_image_is_immediate_failure(self):
        self.assertEqual(self.exercise([], images=["sha256:" + "b" * 64], fail=True), (0, 0))

    def test_real_missing_listener_exhausts_bound(self):
        self.assertEqual(self.exercise([self.sockets("")] * 30, fail=True), (30, 29))
