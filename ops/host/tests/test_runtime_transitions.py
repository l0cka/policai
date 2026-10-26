import unittest
from unittest.mock import Mock

import host

IMAGE = "sha256:" + "a" * 64
ACTIVE = {"heads": {"probono": "b" * 40}, "images": {"worker": IMAGE}, "target": "b" * 40}


def listeners(*addresses):
    return "\n".join("LISTEN 0 10 " + a + " 0.0.0.0:*" for a in addresses)


class HealthTests(unittest.TestCase):
    def host(self, sockets, image=IMAGE):
        obj = host.Host.__new__(host.Host)
        obj.verify_database = Mock()

        def docker(*args):
            if args[-1] != image:
                raise host.ProcessFailed("command exited with status 1")
            return image

        obj.docker = Mock(side_effect=docker)
        obj.runner = Mock()
        obj.runner.execute.return_value = sockets
        return obj

    def test_healthy_means_database_identity_worker_image_and_loopback_listener(self):
        obj = self.host(listeners("127.0.0.1:5433", "127.0.0.1:22"))
        obj.health_snapshot(ACTIVE)
        obj.verify_database.assert_called_once_with()
        obj.docker.assert_called_once_with("image", "inspect", "--format", "{{.Id}}", IMAGE)
        self.assertEqual(obj.runner.execute.call_args.args[0], ["/usr/bin/ss", "-H", "-ltn"])

    def test_a_wildcard_or_missing_database_listener_fails(self):
        for name, sockets in (
            ("wildcard", listeners("0.0.0.0:5433")),
            ("missing", listeners("127.0.0.1:22")),
            ("duplicate", listeners("127.0.0.1:5433", "[::1]:5433")),
        ):
            with self.subTest(name), self.assertRaises(host.Refused):
                self.host(sockets).health_snapshot(ACTIVE)

    def test_retired_runtime_listeners_are_not_required(self):
        self.host(listeners("127.0.0.1:5433")).health_snapshot(ACTIVE)

    def test_an_absent_worker_image_fails_before_the_listener_check(self):
        obj = self.host(listeners("127.0.0.1:5433"), image="sha256:" + "c" * 64)
        with self.assertRaises(host.Refused):
            obj.health_snapshot(ACTIVE)
        obj.runner.execute.assert_not_called()

    def test_a_changed_database_fails_first(self):
        obj = self.host(listeners("127.0.0.1:5433"))
        obj.verify_database.side_effect = host.Refused("database identity or boundary changed")
        with self.assertRaises(host.Refused):
            obj.health_snapshot(ACTIVE)
        obj.docker.assert_not_called()
