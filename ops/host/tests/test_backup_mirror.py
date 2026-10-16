import gzip
import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "backup-mirror.sh"


class BackupMirrorTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / "primary"
        self.source.mkdir()
        self.destination = self.root / "second" / "probono-radar"

    def dump(self, name, text):
        (self.source / name).write_bytes(gzip.compress(text.encode()))

    def mirror(self, mount="/", **overrides):
        env = {
            "PATH": "/usr/bin:/bin",
            "PROBONO_MIRROR_SOURCE": str(self.source),
            "PROBONO_MIRROR_MOUNT": mount,
            "PROBONO_MIRROR_DESTINATION": str(self.destination),
            **overrides,
        }
        return subprocess.run(
            ["/usr/bin/bash", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60
        )

    def test_copies_dumps_privately_with_checksums_and_never_overwrites_or_deletes(self):
        self.dump("radar-2026-10-14.sql.gz", "first")
        self.dump("radar-2026-10-15.sql.gz", "second")
        self.dump("globals-2026-10-15.sql.gz", "roles")
        run = self.mirror()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stdout, "mirror: ok, 2 files, newest radar-2026-10-15.sql.gz\n")
        mirrored = sorted(p.name for p in self.destination.glob("radar-*.sql.gz"))
        self.assertEqual(mirrored, ["radar-2026-10-14.sql.gz", "radar-2026-10-15.sql.gz"])
        self.assertFalse((self.destination / "globals-2026-10-15.sql.gz").exists())
        for name in mirrored:
            self.assertEqual((self.destination / name).stat().st_mode & 0o777, 0o600)
        sums = (self.destination / "SHA256SUMS.txt").read_text()
        for name in mirrored:
            digest = hashlib.sha256((self.destination / name).read_bytes()).hexdigest()
            self.assertIn(f"{digest}  {name}\n", sums)

        kept = (self.destination / "radar-2026-10-15.sql.gz").read_bytes()
        self.dump("radar-2026-10-15.sql.gz", "rewritten at the source")
        (self.source / "radar-2026-10-14.sql.gz").unlink()
        self.dump("radar-2026-10-16.sql.gz", "third")
        run = self.mirror()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stdout, "mirror: ok, 3 files, newest radar-2026-10-16.sql.gz\n")
        self.assertEqual((self.destination / "radar-2026-10-15.sql.gz").read_bytes(), kept)
        self.assertTrue((self.destination / "radar-2026-10-14.sql.gz").exists())

    def test_fails_loudly_when_a_mirrored_dump_is_corrupt(self):
        self.dump("radar-2026-10-14.sql.gz", "good")
        (self.source / "radar-2026-10-15.sql.gz").write_bytes(b"not gzip")
        run = self.mirror()
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("FAILED gzip check", run.stderr)
        self.assertIn("1 FAILED integrity", run.stderr)

    def test_refuses_to_write_when_the_second_disk_is_not_mounted(self):
        self.dump("radar-2026-10-14.sql.gz", "good")
        unmounted = self.root / "second"
        unmounted.mkdir()
        run = self.mirror(mount=str(unmounted))
        self.assertEqual(run.returncode, 1)
        self.assertIn("is not mounted", run.stderr)
        self.assertFalse(self.destination.exists())

    def test_refuses_without_configured_paths_or_source(self):
        self.assertNotEqual(self.mirror(PROBONO_MIRROR_DESTINATION="").returncode, 0)
        self.source.rmdir()
        run = self.mirror()
        self.assertEqual(run.returncode, 1)
        self.assertIn("missing", run.stderr)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
