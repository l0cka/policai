import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dispatcher as d


class FixtureState(d.State):
    def __init__(self, path):
        self.root, self.owner = Path(path), os.getuid()


class FakeHost:
    def __init__(self, paths=()):
        self.paths, self.events, self.fail = list(paths), [], None

    def event(self, name):
        self.events.append(name)
        if self.fail == name:
            raise RuntimeError("secret must not leak")

    def preflight(self, active):
        self.event("preflight")

    def prepare(self, target):
        self.event("prepare")
        return {
            "previous": {"policai": "a" * 40, "probono": "a" * 40},
            "paths": self.paths,
        }

    def stage(self, record, lanes):
        self.event("stage")

    def activate(self, record, lanes):
        self.event("activate")

    def health(self, record):
        self.event("health")

    def active_record(self, record):
        return {"target": record["target"]}

    def rollback(self, record):
        self.event("rollback")

    def restored_health(self, record):
        self.event("restored_health")


class TransactionTests(unittest.TestCase):
    def setUp(self):
        original = d.secure_path
        self.p = patch.object(
            d,
            "secure_path",
            side_effect=lambda *a, **kw: original(*a, **dict(kw, ancestors=False)),
        )
        self.p.start()
        self.addCleanup(self.p.stop)

    def run_case(self, fail=None):
        self.assertTrue(hasattr(d, "Transaction"), "transaction not implemented")
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / "deploy.lock").touch()
            (p / "worker.lock").touch()
            s = FixtureState(p)
            s.write("active.json", {"target": "a" * 40})
            h = FakeHost(["src/a", "apps/probono/x"])
            h.fail = fail
            t = d.Transaction(s, h)
            if fail:
                with self.assertRaises(d.Refused):
                    t.deploy("b" * 40)
                self.assertTrue((p / "blocked.json").exists())
                self.assertNotIn("secret", (p / "blocked.json").read_text())
                before = list(h.events)
                with self.assertRaises(d.Refused):
                    t.deploy("c" * 40)
                self.assertEqual(h.events, before)
                h.fail = None
                t.rollback()
                self.assertTrue(
                    (p / "blocked.json").exists(), "rollback must not implicitly resume"
                )
                self.assertIn("restored_health", h.events)
            else:
                t.deploy("b" * 40)
                self.assertEqual(h.events, ["preflight", "prepare", "stage", "activate", "health"])
                self.assertFalse((p / "blocked.json").exists())

    def test_success_and_failure_gate(self):
        self.run_case()
        for failure in ("preflight", "prepare", "stage", "activate", "health"):
            with self.subTest(failure=failure):
                self.run_case(failure)

    def test_follow_main_resolves_target_inside_latched_transaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "deploy.lock").touch()
            (root / "worker.lock").touch()
            state = FixtureState(root)
            state.write("active.json", {"target": "a" * 40})
            host = FakeHost(["data/feed.json"])

            def resolve():
                self.assertTrue((root / "blocked.json").exists())
                host.events.append("resolve")
                return "b" * 40

            host.resolve_target = resolve
            d.Transaction(state, host).deploy(None)
            self.assertLess(host.events.index("resolve"), host.events.index("stage"))
            self.assertEqual(state.read("active.json")["target"], "b" * 40)

    def test_recovery_requires_verified_rollback_and_preserves_old_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "deploy.lock").touch()
            (root / "worker.lock").touch()
            state = FixtureState(root)
            state.write("active.json", {"target": "a" * 40})
            host = FakeHost(["src/change"])
            host.fail = "health"
            tx = d.Transaction(state, host)
            with self.assertRaises(d.Refused):
                tx.deploy("b" * 40)
            blocked = state.read("blocked.json")
            with self.assertRaises(d.Refused):
                tx.deploy("c" * 40, recovery=blocked["id"])
            host.fail = None
            tx.rollback()
            with self.assertRaises(d.Refused):
                tx.deploy("c" * 40, recovery="0" * 32)
            tx.deploy("c" * 40, recovery=blocked["id"])
            self.assertTrue((root / "history" / (blocked["id"] + ".json")).is_file())
            self.assertFalse((root / "blocked.json").exists())

    def test_invalid_sha_never_commands(self):
        self.assertTrue(hasattr(d, "Transaction"))
        with tempfile.TemporaryDirectory() as tmp:
            h = FakeHost()
            t = d.Transaction(FixtureState(tmp), h)
            for bad in ["main", "B" * 40, "--help", "b" * 39]:
                with self.assertRaises(d.Refused):
                    t.deploy(bad)
            self.assertEqual(h.events, [])


class SwapTests(unittest.TestCase):
    def test_real_directory_swap_and_idempotent_rollback(self):
        self.assertTrue(hasattr(d, "promote"), "artifact promotion missing")
        for failure in (None, "old-retained", "candidate-active"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                p = Path(tmp)
                active = p / "app"
                new = p / "candidate"
                old = p / "old"
                failed = p / "failed"
                active.mkdir()
                new.mkdir()
                (active / "version").write_text("old")
                (new / "version").write_text("new")

                def journal(phase, failure=failure):
                    if failure == phase:
                        raise RuntimeError("power loss fixture")

                if failure:
                    with self.assertRaises(RuntimeError):
                        d.promote(new, active, old, journal)
                else:
                    d.promote(new, active, old, journal)
                    self.assertEqual((active / "version").read_text(), "new")
                d.undo_promote(new, active, old, failed)
                d.undo_promote(new, active, old, failed)
                self.assertEqual((active / "version").read_text(), "old")
                self.assertTrue(new.exists() or failed.exists())
