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
            (["src/x", "public/icon.svg", "mcp/x", "next.config.ts"], {"policai"}),
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

    def test_each_path_class_selects_only_the_lanes_it_needs(self):
        none, policai, probono = set(), {"policai"}, {"probono"}
        both = policai | probono
        cases = [
            ("docs", "docs/hosting-argus.md", none),
            ("docs", "docs/design/audit/01-policai-desktop.png", none),
            ("markdown", "README.md", none),
            ("markdown", "apps/probono/RUNBOOK.md", none),
            ("markdown", "apps/probono/dashboard/EDITORIAL.md", none),
            ("markdown", "src/test/fixtures/articles/fixture-explainer-draft.md", none),
            ("markdown", "public/notes.md", policai),
            ("markdown", "apps/probono/dashboard/public/notes.md", probono),
            ("github", ".github/workflows/pull-request-checks.yml", none),
            ("ops-host", "ops/host/dispatcher.py", none),
            ("ops-host", "ops/host/units/policai-pull.service", none),
            ("ops-collector", "ops/collector/policai-collect.sh", none),
            ("test", "src/lib/articles.test.ts", none),
            ("test", "src/components/policy-browser.test.tsx", none),
            ("test", "src/lib/__tests__/helper.ts", none),
            ("test", "apps/probono/worker/src/lib/parse.test.ts", none),
            ("scripts", "scripts/collect.ts", none),
            ("scripts", "scripts/sync-design-tokens.mjs", none),
            ("package", "package.json", policai),
            ("package", "package-lock.json", policai),
            ("package", "tsconfig.json", policai),
            ("design", "design/tokens.css", policai),
            ("data", "data/articles/weekly.md", none),
            ("data", "public/data/meta.json", none),
            ("probono", "apps/probono/dashboard/package.json", probono),
            ("probono", "apps/probono/worker/security-test/enrich-boundary.test.mjs", probono),
            ("policai", "src/app/design-tokens.css", policai),
            ("policai", "src/lib/test.ts", policai),
            ("policai", "next.config.ts", policai),
            ("default", "vitest.config.ts", both),
            ("default", "eslint.config.mjs", both),
            ("default", "ops/other/x.sh", both),
            ("default", "docs", both),
        ]
        for name, path, expected in cases:
            with self.subTest(route=name, path=path):
                self.assertEqual(d.classify([path]), expected)

    def test_a_change_set_selects_the_union_of_its_lanes(self):
        cases = [
            (["README.md", "src/lib/articles.test.ts", "scripts/collect.ts"], set()),
            (["docs/api.md", "design/tokens.css"], {"policai"}),
            (["package-lock.json", "apps/probono/worker/src/digest.ts"], {"policai", "probono"}),
            (["docs/api.md", "ops/host/README.txt", "LICENSE"], {"policai", "probono"}),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(d.classify(paths), expected)


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
