import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import install


class InstallationTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        source, destination = root / "source", root / "destination"
        source.mkdir()
        destination.mkdir()
        entries = []
        for name in ("existing", "absent"):
            (source / name).write_text("new " + name)
            entries.append((name, destination / name, 0o644, os.getuid(), os.getgid()))
        (destination / "existing").write_text("original bytes\n")
        (destination / "existing").chmod(0o750)
        original = [install.snapshot(entry[1]) for entry in entries]

        def check(path, owner=0, directory=False):
            # Keep real type, alias, mode and owner checks within the fixture;
            # temporary-directory ancestors are not production authority paths.
            if path.resolve() != path or path.is_symlink():
                raise install.Refused("fixture alias")
            info = path.stat()
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise install.Refused("fixture permissions")
            if directory != path.is_dir():
                raise install.Refused("fixture type")

        tx = install.FileTransaction(source, root / "journal", entries, check)
        return tx, original

    def test_installs_and_restores_bytes_modes_and_original_absence(self):
        with tempfile.TemporaryDirectory() as tmp:
            tx, original = self.fixture(tmp)
            tx.apply()
            for name, path, *_ in tx.entries:
                self.assertEqual(path.read_text(), "new " + name)
                self.assertEqual(path.stat().st_mode & 0o777, 0o644)
            tx.rollback()
            self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], original)
            tx.rollback()
            self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], original)
            with self.assertRaises(install.Refused):
                tx.apply()

    def test_every_apply_checkpoint_is_recoverable(self):
        for phase in ("preparing", "prepared", "replaced:0", "replaced:1"):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as tmp:
                tx, original = self.fixture(tmp)

                def interrupt(current, phase=phase):
                    if current == phase:
                        raise InterruptedError("fixture crash")

                tx.checkpoint = interrupt
                with self.assertRaises(InterruptedError):
                    tx.apply()
                tx.checkpoint = lambda phase: None
                tx.rollback()
                tx.rollback()
                self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], original)

    def test_rollback_can_resume_after_each_restoration(self):
        for phase in ("restored:0", "restored:1"):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as tmp:
                tx, original = self.fixture(tmp)
                tx.apply()

                def interrupt(current, phase=phase):
                    if current == phase:
                        raise InterruptedError("fixture crash")

                tx.checkpoint = interrupt
                with self.assertRaises(InterruptedError):
                    tx.rollback()
                tx.checkpoint = lambda phase: None
                tx.rollback()
                self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], original)

    def test_unrelated_edit_stops_rollback_before_any_restoration(self):
        with tempfile.TemporaryDirectory() as tmp:
            tx, _ = self.fixture(tmp)
            tx.apply()
            tx.entries[0][1].write_text("operator edit")
            current = [install.snapshot(entry[1]) for entry in tx.entries]
            with self.assertRaises(install.Refused):
                tx.rollback()
            self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], current)

    def test_corrupt_backup_stops_rollback_before_any_restoration(self):
        with tempfile.TemporaryDirectory() as tmp:
            tx, _ = self.fixture(tmp)
            tx.apply()
            (tx.journal / "0.before").write_text("corrupt")
            current = [install.snapshot(entry[1]) for entry in tx.entries]
            with self.assertRaises(install.Refused):
                tx.rollback()
            self.assertEqual([install.snapshot(entry[1]) for entry in tx.entries], current)

    def test_symlink_destination_is_rejected_before_any_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            tx, _ = self.fixture(tmp)
            target = Path(tmp) / "unrelated"
            target.write_text("preserve me")
            tx.entries[1][1].symlink_to(target)
            with self.assertRaises(install.Refused):
                tx.apply()
            self.assertEqual(tx.entries[0][1].read_text(), "original bytes\n")
            self.assertEqual(target.read_text(), "preserve me")
            self.assertFalse(tx.journal.exists())

    def test_plan_has_only_reviewed_files_and_no_digest_or_timer_targets(self):
        script = Path(install.__file__)
        result = subprocess.run(
            [sys.executable, "-I", str(script), "plan"], capture_output=True, text=True, check=True
        )
        plan = json.loads(result.stdout)
        self.assertEqual(len(plan["files"]), 11)
        self.assertFalse(plan["activates_runtimes"])
        self.assertFalse(plan["changes_timers"])
        for item in plan["files"]:
            self.assertNotIn("digest", item["destination"])
            self.assertNotIn(".timer", item["destination"])
            self.assertNotIn("runtime.env", item["destination"])
        for command in ("apply", "rollback"):
            result = subprocess.run(
                [sys.executable, "-I", str(script), command], capture_output=True, text=True
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Refused:", result.stderr)

    def test_parent_replacement_cannot_redirect_an_atomic_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original, moved, unrelated = root / "original", root / "moved", root / "unrelated"
            original.mkdir()
            unrelated.mkdir()
            (unrelated / "file").write_text("preserve")
            replace = os.replace

            def switch_parent(*args, **kwargs):
                original.rename(moved)
                original.symlink_to(unrelated, target_is_directory=True)
                return replace(*args, **kwargs)

            with patch.object(install.os, "replace", side_effect=switch_parent):
                install.atomic_write(
                    original / "file", b"candidate", 0o644, os.getuid(), os.getgid()
                )
            self.assertEqual((unrelated / "file").read_text(), "preserve")
            self.assertEqual((moved / "file").read_text(), "candidate")
            with self.assertRaises(install.Refused):
                install.snapshot(original / "file")

    def test_manifest_requires_reviewed_digest_and_complete_unchanged_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = set(install.FILES) | {"install.py"}
            for name in names:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture " + name)
            manifest = "".join(
                install.digest((root / name).read_bytes()) + "  " + name + "\n"
                for name in sorted(names)
            )
            (root / "MANIFEST.sha256").write_text(manifest)
            expected = install.digest(manifest.encode())
            with patch.object(install, "REVIEW", root), patch.object(install, "protected"):
                self.assertEqual(set(install.verify_manifest(expected)), names)
                with self.assertRaises(install.Refused):
                    install.verify_manifest("0" * 64)
                (root / "host.py").write_text("changed")
                with self.assertRaises(install.Refused):
                    install.verify_manifest(expected)
                incomplete = install.digest(b"fixture install.py") + "  install.py\n"
                (root / "MANIFEST.sha256").write_text(incomplete)
                with self.assertRaises(install.Refused):
                    install.verify_manifest(install.digest(incomplete.encode()))

    def test_held_requires_idle_jobs_no_dropins_and_both_masks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for suffix in (".service", ".timer"):
                (root / ("probono-digest" + suffix)).symlink_to("/dev/null")
            for deviation in (None, "active", "dropin", "mask", "worker", "manual"):

                def command(argv, user=False, deviation=deviation):
                    if argv[0] == "/usr/bin/docker":
                        return "worker-id" if deviation == "worker" else ""
                    if argv[0] == "/usr/bin/ps":
                        return "/bin/bash ops/enrich.sh" if deviation == "manual" else ""
                    masked = any("digest" in part for part in argv)
                    return "\n".join(
                        [
                            "LoadState=" + ("masked" if masked else "loaded"),
                            "ActiveState=" + ("active" if deviation == "active" else "inactive"),
                            "SubState=dead",
                            "DropInPaths=" + ("/fixture.conf" if deviation == "dropin" else ""),
                            "UnitFileState="
                            + ("masked" if masked and deviation != "mask" else "enabled"),
                        ]
                    )

                with (
                    self.subTest(deviation=deviation),
                    patch.object(install, "USER_UNITS", root),
                    patch.object(install, "command", side_effect=command),
                ):
                    if deviation:
                        with self.assertRaises(install.Refused):
                            install.held()
                    else:
                        install.held()


if __name__ == "__main__":
    unittest.main()
