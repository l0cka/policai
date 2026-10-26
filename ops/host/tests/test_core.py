import os
import tempfile
import unittest
from pathlib import Path

from test_transaction import FakeClock

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
            (["src/x", "public/icon.svg", "mcp/x", "next.config.ts"], set()),
            (["apps/probono/x", "data/x"], {"probono"}),
            (["apps/probono"], set()),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(d.classify(paths), expected)
        for path in ["../x", "/x", "x//y", "x/./y", "x\0y", ""]:
            with self.subTest(invalid=path), self.assertRaises(ValueError):
                d.classify([path])

    def test_only_worker_image_inputs_select_the_lane(self):
        none, probono = set(), {"probono"}
        cases = [
            ("probono", "apps/probono/docker-compose.yaml", probono),
            ("probono", "apps/probono/worker/src/digest.ts", probono),
            ("probono", "apps/probono/worker/Dockerfile", probono),
            ("probono", "apps/probono/worker/package-lock.json", probono),
            ("probono", "apps/probono/ops/enrich.sh", probono),
            ("probono", "apps/probono/db/schema.sql", probono),
            ("probono", "apps/probono/worker/security-test/enrich-boundary.test.mjs", probono),
            ("dashboard", "apps/probono/dashboard/package.json", none),
            ("dashboard", "apps/probono/dashboard/app/page.tsx", none),
            ("dashboard", "apps/probono/dashboard/public/notes.md", none),
            ("markdown", "README.md", none),
            ("markdown", "apps/probono/RUNBOOK.md", none),
            ("markdown", "apps/probono/worker/NOTES.md", none),
            ("test", "apps/probono/worker/src/lib/parse.test.ts", none),
            ("test", "apps/probono/worker/src/__tests__/helper.ts", none),
            ("test", "src/lib/articles.test.ts", none),
            ("policai", "src/app/page.tsx", none),
            ("policai", "public/icon.svg", none),
            ("policai", "mcp/server.ts", none),
            ("policai", "design/tokens.css", none),
            ("policai", "package.json", none),
            ("policai", "package-lock.json", none),
            ("policai", "next.config.ts", none),
            ("policai", "wrangler.jsonc", none),
            ("data", "data/articles/weekly.md", none),
            ("data", "public/data/meta.json", none),
            ("docs", "docs/hosting-argus.md", none),
            ("github", ".github/workflows/pull-request-checks.yml", none),
            ("ops", "ops/host/dispatcher.py", none),
            ("ops", "ops/collector/policai-collect.sh", none),
            ("scripts", "scripts/collect.ts", none),
            ("other", "vitest.config.ts", none),
            ("other", "LICENSE", none),
            ("other", "apps/probono", none),
            ("other", "apps/probono-other/worker/x.ts", none),
        ]
        for name, path, expected in cases:
            with self.subTest(route=name, path=path):
                self.assertEqual(d.classify([path]), expected)

    def test_a_change_set_selects_the_union_of_its_lanes(self):
        cases = [
            (["README.md", "src/lib/articles.test.ts", "scripts/collect.ts"], set()),
            (["docs/api.md", "src/app/page.tsx", "apps/probono/dashboard/app/page.tsx"], set()),
            (["package-lock.json", "apps/probono/worker/src/digest.ts"], {"probono"}),
            (
                ["docs/api.md", "ops/host/README.txt", "apps/probono/docker-compose.yaml"],
                {"probono"},
            ),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(d.classify(paths), expected)


class ActiveRecordTests(unittest.TestCase):
    OLD, NEW = "a" * 40, "b" * 40
    WORKER = "sha256:" + "1" * 64
    CURRENT = {"heads": {"probono": OLD}, "images": {"worker": WORKER}, "target": OLD}

    def test_the_retired_two_runtime_record_parses_to_the_current_shape(self):
        legacy = {
            "heads": {"policai": self.NEW, "probono": self.OLD},
            "root_build": "next-build-id",
            "images": {"dashboard": "sha256:" + "2" * 64, "worker": self.WORKER},
            "target": self.OLD,
        }
        self.assertEqual(d.parse_active(legacy), self.CURRENT)
        self.assertEqual(d.parse_active(self.CURRENT), self.CURRENT)
        self.assertEqual(
            d.parse_active({**legacy, "bootstrap_pending": True}),
            {**self.CURRENT, "bootstrap_pending": True},
        )
        self.assertNotIn(
            "bootstrap_pending", d.parse_active({**legacy, "bootstrap_pending": False})
        )

    def test_a_record_without_the_release_identity_is_refused(self):
        for record in (
            {},
            {"target": self.OLD},
            {"heads": {"policai": self.OLD}, "images": {"worker": self.WORKER}, "target": self.OLD},
            {
                "heads": {"probono": self.OLD},
                "images": {"dashboard": self.WORKER},
                "target": self.OLD,
            },
            {"heads": {"probono": "main"}, "images": {"worker": self.WORKER}, "target": self.OLD},
            {"heads": self.OLD, "images": {"worker": self.WORKER}, "target": self.OLD},
        ):
            with self.subTest(record=record), self.assertRaises(d.Refused):
                d.parse_active(record)


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
            fake = FakeClock()
            with state.lock(exclusive=False):
                state.require_ready()
                with self.assertRaises(d.Refused):
                    with state.lock(exclusive=True, clock=fake.clock, sleep=fake.sleep):
                        pass
            self.assertEqual(fake.sleeps, [])
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
