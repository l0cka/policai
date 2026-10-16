import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import host
import install

SOURCE = Path(install.__file__).parent
FIXTURE = SOURCE / "tests" / "fixtures" / "installed-2026-09-11"
ABSENT = set((FIXTURE / "absent.txt").read_text().split())
CHANGED = {name for name in install.FILES if (FIXTURE / name).is_file()}
ACTIVE = {
    "heads": {"policai": "0" * 40, "probono": "0" * 40},
    "images": {"dashboard": "sha256:" + "0" * 64, "worker": "sha256:" + "0" * 64},
    "root_build": "fixture-build",
    "target": "0" * 40,
}
MIRROR = {
    "source": "/home/l0cka/Backups/probono-radar",
    "mount": "/mnt/argus-ssd",
    "destination": "/mnt/argus-ssd/home/l0cka/backups/probono-radar",
}
CONFIG = {
    "approved_target": "0" * 40,
    "follow_main": True,
    "recovery_authorization": "FIXTURE-RECOVERY-VALUE-NEVER-PRINTED",
    "remote": "https://github.com/l0cka/policai.git",
    "compose_sha256": "0" * 64,
    "min_free_bytes": 8000000000,
    "db": {"id": "0" * 64, "image": "sha256:" + "0" * 64, "cluster": "1"},
    "installed_hashes": {"/usr/local/libexec/policai-host/cli.py": "FIXTURE-HASH-NEVER-PRINTED"},
    "backup_mirror": MIRROR,
}
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
        (self.state / "active.json").write_text(json.dumps(ACTIVE))
        self.config = self.root / "config.json"
        self.config.write_text(json.dumps(CONFIG))
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
                config=self.config,
                **({} if expect_installed is None else {"expect_installed": expect_installed}),
            )

    def plan(self):
        with patch.object(install, "command", side_effect=systemctl()):
            return install.plan(self.review, self.state, self.config, self.entries, check)

    def gates(self):
        return dict(self.plan()[1])

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

    def test_a_foreign_file_refuses_a_re_apply_before_any_write(self):
        for name in ("bin/docker", "host.py"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                host = Host(tmp)
                tx = host.transaction()
                tx.apply(host.expected)
                tx.rollback()
                path = host.path(name)
                original = path.read_bytes()
                path.write_bytes(b"foreign edit\n")
                before = listing(host.root)
                for step in ("apply", "rollback"):
                    with self.assertRaises(install.Refused):
                        getattr(tx, step)()
                    self.assertEqual(listing(host.root), before)
                record = json.loads((host.journal / "journal.json").read_text())
                self.assertEqual(record["phase"], "rolled-back")
                path.write_bytes(original)
                tx.rollback()
                self.assertEqual(host.tree(), host.original)
                tx.apply()
                host.assert_upgraded(self)

    def test_apply_refuses_when_the_verified_manifest_disagrees_with_the_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Host(tmp)
            hashes = install.verify_manifest(host.manifest, host.review, check)
            hashes["host.py"] = "0" * 64
            with (
                patch.object(install, "verify_manifest", return_value=hashes),
                self.assertRaises(install.Refused),
            ):
                host.upgrade("apply", expect_installed=host.expected)
            self.assertEqual(host.tree(), host.original)
            self.assertFalse((host.state / "upgrades").exists())

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
            ({"active.json": ACTIVE}, True),
            ({"active.json": {**ACTIVE, "bootstrap_pending": False}}, True),
            ({"active.json": {**ACTIVE, "bootstrap_pending": True}}, False),
            ({"active.json": {**ACTIVE, "bootstrap_pending": None}}, False),
            ({"active.json": {**ACTIVE, "bootstrap_pending": 0}}, False),
            ({"active.json": {**ACTIVE, "bootstrap_pending": "false"}}, False),
            ({"active.json": {}}, False),
            ({"active.json": {"bootstrap_pending": False}}, False),
            ({"active.json": {"phase": "active"}}, False),
            ({"active.json": {k: v for k, v in ACTIVE.items() if k != "target"}}, False),
            ({"active.json": {k: v for k, v in ACTIVE.items() if k != "heads"}}, False),
            ({"active.json": [ACTIVE]}, False),
            ({"active.json": ACTIVE, "blocked.json": {"phase": "failed-review-required"}}, False),
            ({}, False),
        )
        for files, ready in cases:
            with (
                self.subTest(files=json.dumps(files, sort_keys=True)[:120]),
                tempfile.TemporaryDirectory() as tmp,
            ):
                state = Path(tmp) / "state"
                state.mkdir()
                for name, record in files.items():
                    (state / name).write_text(json.dumps(record))
                if ready:
                    install.dispatcher_ready(state, check)
                else:
                    with self.assertRaises(install.Refused):
                        install.dispatcher_ready(state, check)

    def test_plan_evaluates_the_unprivileged_gates_on_the_live_state_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            host_ = Host(tmp)
            items, results = host_.plan()
            self.assertEqual([item["source"] for item in items], list(install.FILES))
            gates = dict(results)
            self.assertEqual(
                list(gates),
                [
                    "1 protected snapshot as root",
                    "2 reviewed manifest",
                    "3 deployment lock",
                    "4 held triggers",
                    "5 dispatcher ready",
                    "6 config backup_mirror",
                ],
            )
            self.assertEqual(gates["1 protected snapshot as root"], "not evaluated by plan")
            self.assertEqual(gates["3 deployment lock"], "not evaluated by plan")
            self.assertEqual(
                gates["2 reviewed manifest"], f"pass (MANIFEST.sha256 {host_.manifest})"
            )
            for gate in ("4 held triggers", "5 dispatcher ready", "6 config backup_mirror"):
                self.assertEqual(gates[gate], "pass", gate)
            text = install.render_gates(results)
            self.assertIn("every evaluated gate passes", text)
            self.assertEqual(host_.tree(), host_.original)
            self.assertFalse((host_.state / "upgrades").exists())
            host_.upgrade("apply", expect_installed=host_.expected)
            host_.assert_upgraded(self)

    def test_plan_and_apply_refuse_the_same_dispatcher_states(self):
        for record in ({**ACTIVE, "bootstrap_pending": True}, {}, {"bootstrap_pending": False}):
            with self.subTest(record=record), tempfile.TemporaryDirectory() as tmp:
                host_ = Host(tmp)
                (host_.state / "active.json").write_text(json.dumps(record))
                gates = host_.gates()
                self.assertTrue(gates["5 dispatcher ready"].startswith("refused: "), gates)
                self.assertNotIn(
                    "every evaluated gate passes", install.render_gates(list(gates.items()))
                )
                with self.assertRaises(install.Refused):
                    host_.upgrade("apply", expect_installed=host_.expected)
                self.assertEqual(host_.tree(), host_.original)
                self.assertFalse((host_.state / "upgrades").exists())

    def test_plan_names_the_missing_backup_mirror_block_and_apply_refuses_until_it_is_added(self):
        with tempfile.TemporaryDirectory() as tmp:
            host_ = Host(tmp)
            without = {k: v for k, v in CONFIG.items() if k != "backup_mirror"}
            host_.config.write_text(json.dumps(without))
            text = install.render_gates(host_.plan()[1])
            self.assertIn("6 config backup_mirror: refused: ", text)
            self.assertIn(f"{host_.config} has no backup_mirror block", text)
            for key, value in MIRROR.items():
                self.assertIn(f'"{key}": "{value}"', text)
            self.assertNotIn("FIXTURE-RECOVERY-VALUE-NEVER-PRINTED", text)
            self.assertNotIn("FIXTURE-HASH-NEVER-PRINTED", text)
            self.assertNotIn("0" * 40, text)
            with self.assertRaises(install.Refused):
                host_.upgrade("apply", expect_installed=host_.expected)
            self.assertEqual(host_.tree(), host_.original)
            self.assertFalse((host_.state / "upgrades").exists())
            self.assertEqual(json.loads(host_.config.read_text()), without)
            host_.config.write_text(json.dumps({**without, "backup_mirror": MIRROR}))
            self.assertEqual(host_.gates()["6 config backup_mirror"], "pass")
            host_.upgrade("apply", expect_installed=host_.expected)
            host_.assert_upgraded(self)
            host_.upgrade("apply")
            host_.assert_upgraded(self)
            self.assertEqual(
                json.loads(host_.config.read_text()), {**without, "backup_mirror": MIRROR}
            )

    def test_config_gate_never_echoes_config_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            host_ = Host(tmp)
            broken = {
                "missing": None,
                "not json": "{FIXTURE-GARBAGE-NEVER-PRINTED",
                "not an object": json.dumps(["FIXTURE-LIST-VALUE-NEVER-PRINTED"]),
                "invalid block": json.dumps(
                    {**CONFIG, "backup_mirror": {**MIRROR, "mount": "/FIXTURE-MOUNT-NEVER-PRINTED"}}
                ),
            }
            for reason, content in broken.items():
                with self.subTest(reason=reason):
                    if content is None:
                        host_.config.unlink()
                    else:
                        host_.config.write_text(content)
                    text = install.render_gates(host_.plan()[1])
                    self.assertIn("6 config backup_mirror: refused: ", text)
                    self.assertNotIn("NEVER-PRINTED", text)
                    with self.assertRaises(install.Refused):
                        host_.upgrade("apply", expect_installed=host_.expected)
                    self.assertEqual(host_.tree(), host_.original)
                    self.assertFalse((host_.state / "upgrades").exists())

    def test_config_gate_accepts_exactly_the_blocks_the_dispatcher_accepts(self):
        blocks = (
            MIRROR,
            {**MIRROR, "extra": "ignored"},
            {**MIRROR, "mount": "/"},
            {**MIRROR, "mount": "/mnt/other"},
            {**MIRROR, "mount": "/home"},
            {**MIRROR, "destination": "/mnt/argus-ssd"},
            {**MIRROR, "destination": "/mnt/argus-ssd/../x"},
            {**MIRROR, "destination": "/mnt/argus-ssd/x/"},
            {**MIRROR, "source": "relative/path"},
            {**MIRROR, "source": 7},
            {k: v for k, v in MIRROR.items() if k != "destination"},
            "not a block",
        )
        for block in blocks:
            with self.subTest(block=block), tempfile.TemporaryDirectory() as tmp:
                config = Path(tmp) / "config.json"
                config.write_text(json.dumps({**CONFIG, "backup_mirror": block}))
                try:
                    host.mirror_environment({"backup_mirror": block})
                    accepted = True
                except (host.Refused, KeyError, TypeError):
                    accepted = False
                if accepted:
                    install.config_ready(config, check)
                else:
                    with self.assertRaises(install.Refused):
                        install.config_ready(config, check)

    def test_user_preflight_commands_run_directly_as_l0cka_without_root(self):
        l0cka = SimpleNamespace(pw_name="l0cka", pw_uid=4242)
        with patch.object(install.pwd, "getpwuid", return_value=l0cka):
            output = install.command(["/usr/bin/env"], user=True).splitlines()
        self.assertEqual(
            sorted(output),
            sorted(
                [
                    "HOME=/home/l0cka",
                    "LANG=C.UTF-8",
                    "PATH=/usr/bin:/bin",
                    "XDG_RUNTIME_DIR=/run/user/4242",
                ]
            ),
        )
        other = SimpleNamespace(pw_name="someone-else", pw_uid=4242)
        with (
            patch.object(install.pwd, "getpwuid", return_value=other),
            self.assertRaises(install.Refused),
        ):
            install.command(["/usr/bin/env"], user=True)

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
                json.dumps({**ACTIVE, "bootstrap_pending": True})
            ),
            "uninitialised record": lambda host: (host.state / "active.json").write_text("{}"),
            "config without backup_mirror": lambda host: host.config.write_text(
                json.dumps({k: v for k, v in CONFIG.items() if k != "backup_mirror"})
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
                        config=host.config,
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
