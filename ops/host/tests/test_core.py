import os
import tempfile
import unittest
from pathlib import Path

try:
    import dispatcher as d
except ModuleNotFoundError:
    d = None


class ClassificationTests(unittest.TestCase):
    def test_lane_classification_is_conservative_and_validated(self):
        self.assertTrue(callable(getattr(d, "classify", None)), "classification not implemented")
        cases = [
            ([], set()),
            (["data/x", "public/data/x"], set()),
            (["apps/probono/worker/x"], {"probono"}),
            (["src/x", "public/icon.svg", "mcp/x", "next.config.ts"], {"policai"}),
            (["package-lock.json"], {"policai", "probono"}),
            (["shared/a"], {"policai", "probono"}),
            (["apps/probono/x", "data/x"], {"probono"}),
            (["apps/probono"], {"policai", "probono"}),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(d.classify(paths), expected)
        for path in ["../x", "/x", "x//y", "x/./y", "x\0y", ""]:
            with self.subTest(invalid=path), self.assertRaises(ValueError):
                d.classify([path])


class StateTests(unittest.TestCase):
    def setUp(self):
        # Confined fixtures live below a private directory with a group-writable
        # ancestor. Do not relax the production validator to accommodate fixtures.
        from unittest.mock import patch

        original = d.secure_path
        self.patch = patch.object(
            d,
            "secure_path",
            side_effect=lambda *a, **kw: original(*a, **dict(kw, ancestors=False)),
        )
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_persistent_gate_and_stable_lock_are_fail_closed(self):
        self.assertTrue(callable(getattr(d, "State", None)), "persistent gate missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "deploy.lock").write_text("")
            (root / "worker.lock").write_text("")
            state = d.State(root, owner=os.getuid())
            state.write("active.json", {"sha": "a" * 40})
            inode = (root / "deploy.lock").stat().st_ino
            with state.lock(exclusive=False):
                state.require_ready()
                with self.assertRaises(d.Refused):
                    with state.lock(exclusive=True):
                        pass
            state.write("blocked.json", {"phase": "building"})
            with self.assertRaises(d.Refused):
                state.require_ready()
            self.assertEqual((root / "deploy.lock").stat().st_ino, inode)
            (root / "blocked.json").write_text("{broken")
            with self.assertRaises(d.Refused):
                state.require_ready()
            (root / "blocked.json").unlink()
            (root / "blocked.json").symlink_to(root / "absent")
            with self.assertRaises(d.Refused):
                state.require_ready()
            (root / "active.json").chmod(0o666)
            with self.assertRaises(d.Refused):
                state.read("active.json")
            (root / "deploy.lock").unlink()
            with self.assertRaises(d.Refused):
                with state.lock(exclusive=True):
                    pass


if __name__ == "__main__":
    unittest.main()
