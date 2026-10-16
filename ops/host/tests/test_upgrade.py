import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import install

SOURCE = Path(install.__file__).parent
FIXTURE = SOURCE / "tests" / "fixtures" / "installed-2026-09-11"
ABSENT = set((FIXTURE / "absent.txt").read_text().split())
CHANGED = {name for name in install.FILES if (FIXTURE / name).is_file()}
TIMERS = (
    "policai-pull.timer",
    "probono-ingest.timer",
    "probono-enrich.timer",
    "probono-backup.timer",
    "probono-backup-mirror.timer",
    "probono-verify-deadlines.timer",
)


def check(path, owner=0, directory=False):
    if path.resolve() != path or path.is_symlink():
        raise install.Refused("fixture alias")
    info = path.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise install.Refused("fixture permissions")
    if directory != path.is_dir():
        raise install.Refused("fixture type")


def systemctl(active=None):
    def command(argv, user=False):
        if argv[0] != "/usr/bin/systemctl":
            return ""
        unit = argv[-2]
        return "\n".join(
            [
                "LoadState=" + ("masked" if "digest" in unit else "loaded"),
                "ActiveState=" + ("active" if unit == active else "inactive"),
                "SubState=dead",
                "DropInPaths=",
                "UnitFileState=" + ("masked" if "digest" in unit else "enabled"),
            ]
        )

    return command


def listing(directory):
    return {
        str(path.relative_to(directory)): install.digest(path.read_bytes())
        for path in sorted(directory.rglob("*"))
        if path.is_file()
    }


class Host:
    def __init__(self, directory):
        self.root = Path(directory)
        self.review, self.state = self.root / "review", self.root / "state"
        self.units = self.root / "user-units"
        names = set(install.FILES) | {"install.py"}
        for name in names:
            target = self.review / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / name).read_bytes())
        manifest = "".join(
            install.digest((self.review / name).read_bytes()) + "  " + name + "\n"
            for name in sorted(names)
        )
        (self.review / "MANIFEST.sha256").write_text(manifest)
        self.manifest = install.digest(manifest.encode())
        self.entries = []
        for name, (destination, mode, _) in install.FILES.items():
            path = self.root / "installed" / destination.lstrip("/")
            path.parent.mkdir(parents=True, exist_ok=True)
            self.entries.append((name, path, mode, os.getuid(), os.getgid()))
            if name in ABSENT:
                continue
            origin = FIXTURE / name if name in CHANGED else SOURCE / name
            path.write_bytes(origin.read_bytes())
            path.chmod(mode)
        self.state.mkdir()
        (self.state / "deploy.lock").touch()
        (self.state / "active.json").write_text(json.dumps({"bootstrap_pending": False}))
        self.units.mkdir()
        for suffix in (".service", ".timer"):
            (self.units / ("probono-digest" + suffix)).symlink_to("/dev/null")
        self.journal = self.state / "upgrades" / self.manifest
        self.original = self.tree()

    def tree(self):
        return [install.snapshot(entry[1]) for entry in self.entries]

    def transaction(self):
        return install.Upgrade(self.review, self.journal, self.entries, check)

    @property
    def expected(self):
        return install.installed_digest(self.transaction().inventory()[0])

    def path(self, name):
        return next(path for entry, path, *_ in self.entries if entry == name)

    def upgrade(self, step, manifest=None, expect_installed=None):
        with (
            patch.object(install, "USER_UNITS", self.units),
            patch.object(install, "command", side_effect=systemctl()),
        ):
            return install.upgrade(
                step,
                self.manifest if manifest is None else manifest,
                review=self.review,
                state=self.state,
                entries=self.entries,
                check=check,
                **({} if expect_installed is None else {"expect_installed": expect_installed}),
            )

    def assert_upgraded(self, test):
        for name, path, mode, *_ in self.entries:
            test.assertEqual(path.read_bytes(), (self.review / name).read_bytes(), name)
            test.assertEqual(path.stat().st_mode & 0o777, mode, name)
        record = json.loads((self.journal / "journal.json").read_text())
        test.assertEqual(record["phase"], "applied")


class UpgradeTests(unittest.TestCase):
    def test_plan_reports_the_installed_layout_diff_and_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            items = host.transaction().plan()
            self.assertEqual(
                {item["source"]: item["status"] for item in items},
                {
                    name: "changed"
                    if name in CHANGED
                    else "added"
                    if name in ABSENT
                    else "unchanged"
                    for name in install.FILES
                },
            )
            destinations = {name: str(path) for name, path, *_ in host.entries}
            for item in items:
                self.assertEqual(item["destination"], destinations[item["source"]])
                source = (host.review / item["source"]).read_bytes()
                self.assertEqual(item["after"]["sha256"], install.digest(source))
            text = install.render_plan(items, host.journal)
            self.assertIn("-ExecStart=/home/l0cka/.local/bin/probono-backup-mirror.sh", text)
            self.assertIn(
                "+ExecStart=/usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker backup-mirror",
                text,
            )
            self.assertIn("backup-mirror.sh", text)
            self.assertEqual(host.tree(), host.original)
            self.assertFalse(host.journal.exists())

    def test_apply_installs_the_reviewed_files_and_rollback_restores_the_originals(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            state_before = listing(host.state)
            tx = host.transaction()
            tx.apply(host.expected)
            host.assert_upgraded(self)
            record = json.loads((host.journal / "journal.json").read_text())
            for index, (item, snapshot) in enumerate(
                zip(record["files"], host.original, strict=True)
            ):
                self.assertEqual(item["before"], snapshot)
                if item["source"] in CHANGED:
                    backup = (host.journal / f"{index}.before").read_bytes()
                    self.assertEqual(install.digest(backup), snapshot["sha256"])
            self.assertEqual(
                {k: v for k, v in listing(host.state).items() if not k.startswith("upgrades/")},
                state_before,
            )
            tx.rollback()
            self.assertEqual(host.tree(), host.original)
            journal_after_rollback = listing(host.journal)
            tx.rollback()
            self.assertEqual(host.tree(), host.original)
            self.assertEqual(listing(host.journal), journal_after_rollback)
            tx.apply()
            host.assert_upgraded(self)

    def test_a_crash_at_every_checkpoint_converges_on_rerun_or_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoints = ["journaled", "backed-up"] + [
                f"replaced:{index}"
                for index, (name, *_) in enumerate(Host(tmp).entries)
                if name in CHANGED | ABSENT
            ]
        for checkpoint in checkpoints:
            for recovery in ("apply", "rollback"):
                with (
                    self.subTest(checkpoint=checkpoint, recovery=recovery),
                    tempfile.TemporaryDirectory() as tmp,
                ):
                    host = Host(tmp)
                    tx = host.transaction()

                    def interrupt(current, checkpoint=checkpoint):
                        if current == checkpoint:
                            raise InterruptedError("fixture crash")

                    tx.checkpoint = interrupt
                    with self.assertRaises(InterruptedError):
                        tx.apply(host.expected)
                    tx.checkpoint = lambda phase: None
                    getattr(tx, recovery)()
                    if recovery == "apply":
                        host.assert_upgraded(self)
                    else:
                        self.assertEqual(host.tree(), host.original)

    def test_rollback_resumes_after_a_crash_between_restorations(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoints = [
                f"restored:{index}"
                for index, (name, *_) in enumerate(Host(tmp).entries)
                if name in CHANGED | ABSENT
            ]
        for checkpoint in checkpoints:
            with self.subTest(checkpoint=checkpoint), tempfile.TemporaryDirectory() as tmp:
                host = Host(tmp)
                tx = host.transaction()
                tx.apply(host.expected)

                def interrupt(current, checkpoint=checkpoint):
                    if current == checkpoint:
                        raise InterruptedError("fixture crash")

                tx.checkpoint = interrupt
                with self.assertRaises(InterruptedError):
                    tx.rollback()
                tx.checkpoint = lambda phase: None
                tx.rollback()
                self.assertEqual(host.tree(), host.original)

    def test_a_foreign_edit_refuses_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            tx = host.transaction()

            def interrupt(current):
                if current == "replaced:0":
                    raise InterruptedError("fixture crash")

            tx.checkpoint = interrupt
            with self.assertRaises(InterruptedError):
                tx.apply(host.expected)
            tx.checkpoint = lambda phase: None
            host.entries[1][1].write_text("operator edit")
            partial = host.tree()
            for recovery in ("apply", "rollback"):
                with self.assertRaises(install.Refused):
                    getattr(tx, recovery)()
                self.assertEqual(host.tree(), partial)

    def test_apply_refuses_a_file_replaced_between_plan_and_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            items = host.transaction().plan()
            expected = install.installed_digest(items)
            self.assertIn(f"expect-installed: {expected}", install.render_plan(items, host.journal))
            path = host.path("host.py")
            path.write_bytes(path.read_bytes() + b"\nreplaced between plan and apply\n")
            tampered = host.tree()
            with self.assertRaises(install.Refused):
                host.upgrade("apply", expect_installed=expected)
            self.assertEqual(host.tree(), tampered)
            self.assertFalse((host.state / "upgrades").exists())

    def test_first_apply_needs_the_plan_digest_and_a_re_apply_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            with self.assertRaises(install.Refused):
                host.upgrade("apply")
            self.assertEqual(host.tree(), host.original)
            self.assertFalse((host.state / "upgrades").exists())
            host.upgrade("apply", expect_installed=host.expected)
            host.assert_upgraded(self)
            host.upgrade("rollback")
            self.assertEqual(host.tree(), host.original)
            host.upgrade("apply")
            host.assert_upgraded(self)

    def test_rollback_without_a_journal_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            with self.assertRaises(install.Refused):
                host.transaction().rollback()
            self.assertEqual(host.tree(), host.original)

    def test_dispatcher_ready_requires_an_unblocked_completed_activation(self):
        cases = (
            ({"active.json": {"bootstrap_pending": False}}, True),
            ({"active.json": {}}, True),
            ({"active.json": {}, "blocked.json": {"phase": "failed-review-required"}}, False),
            ({"active.json": {"bootstrap_pending": True}}, False),
            ({}, False),
        )
        for files, ready in cases:
            with self.subTest(files=sorted(files)), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp) / "state"
                state.mkdir()
                for name, record in files.items():
                    (state / name).write_text(json.dumps(record))
                if ready:
                    install.dispatcher_ready(state, check)
                else:
                    with self.assertRaises(install.Refused):
                        install.dispatcher_ready(state, check)

    def test_held_refuses_each_active_pull_or_probono_timer(self):
        with tempfile.TemporaryDirectory() as tmp:
            units = Path(tmp)
            for suffix in (".service", ".timer"):
                (units / ("probono-digest" + suffix)).symlink_to("/dev/null")
            for active in (None, *TIMERS):
                with (
                    self.subTest(active=active),
                    patch.object(install, "USER_UNITS", units),
                    patch.object(install, "command", side_effect=systemctl(active)),
                ):
                    if active is None:
                        install.held()
                    else:
                        with self.assertRaises(install.Refused):
                            install.held()

    def test_upgrade_gate_refuses_before_touching_the_host(self):
        refusals = {
            "unverified manifest": lambda host: (host.review / "host.py").write_bytes(b"tampered"),
            "wrong digest": lambda host: setattr(host, "manifest", "0" * 64),
            "blocked dispatcher": lambda host: (host.state / "blocked.json").write_text("{}"),
            "pending bootstrap": lambda host: (host.state / "active.json").write_text(
                json.dumps({"bootstrap_pending": True})
            ),
        }
        for reason, deviate in refusals.items():
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as tmp:
                host = Host(tmp)
                deviate(host)
                with self.assertRaises(install.Refused):
                    host.upgrade("apply", expect_installed=host.expected)
                self.assertEqual(host.tree(), host.original)
                self.assertFalse((host.state / "upgrades").exists())
        for timer in TIMERS:
            with self.subTest(active=timer), tempfile.TemporaryDirectory() as tmp:
                host = Host(tmp)
                with (
                    patch.object(install, "USER_UNITS", host.units),
                    patch.object(install, "command", side_effect=systemctl(timer)),
                    self.assertRaises(install.Refused),
                ):
                    install.upgrade(
                        "apply",
                        host.manifest,
                        review=host.review,
                        state=host.state,
                        entries=host.entries,
                        check=check,
                        expect_installed=host.expected,
                    )
                self.assertEqual(host.tree(), host.original)
                self.assertFalse((host.state / "upgrades").exists())

    def test_upgrade_gate_applies_and_rolls_back_a_healthy_held_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            host.upgrade("apply", expect_installed=host.expected)
            host.assert_upgraded(self)
            (host.state / "blocked.json").write_text("{}")
            host.upgrade("rollback")
            self.assertEqual(host.tree(), host.original)
            self.assertTrue((host.state / "blocked.json").exists())

    def test_cli_refuses_upgrade_apply_and_rollback_outside_the_reviewed_snapshot(self):
        script = str(Path(install.__file__))
        for step in ("apply", "rollback"):
            result = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    script,
                    "upgrade",
                    step,
                    "--manifest-sha256",
                    "0" * 64,
                    "--expect-installed",
                    "0" * 64,
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Refused:", result.stderr)
        result = subprocess.run(
            [sys.executable, "-I", script, "upgrade"], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
