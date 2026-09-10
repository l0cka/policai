import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_transaction import FixtureState

import dispatcher as d
import host as h


class WorkerTests(unittest.TestCase):
    def setUp(self):
        original = d.secure_path
        p = patch.object(
            d,
            "secure_path",
            side_effect=lambda *a, **kw: original(*a, **dict(kw, ancestors=False)),
        )
        p.start()
        self.addCleanup(p.stop)

    def test_actual_bounded_stdin_roundtrip(self):
        value = h.Runner().execute(
            [sys.executable, "-c", "import sys; print(sys.stdin.read())"],
            Path.cwd(),
            stdin_data=b'{"article": "test"}',
        )
        self.assertEqual(json.loads(value), {"article": "test"})
        with self.assertRaises(d.Refused):
            h.Runner().execute(
                [sys.executable, "-c", "pass"], Path.cwd(), stdin_data=b"x" * 1000000
            )

    def test_worker_ready_marker_and_mutation_lock_are_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = FixtureState(tmp)
            (state.root / "deploy.lock").touch()
            (state.root / "worker.lock").touch()
            state.write("active.json", {"ready": True})
            with h.worker_guard(state) as fds:
                self.assertEqual(len(fds), 2)
                with self.assertRaises(d.Refused):
                    with state.lock(exclusive=True):
                        pass
                with self.assertRaises(d.Refused):
                    with h.worker_guard(state):
                        pass
            state.write("blocked.json", {"phase": "failed"})
            with self.assertRaises(d.Refused):
                with h.worker_guard(state):
                    pass

    def test_actual_inherited_descriptor_survives_exec(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "fd"
            file.write_text("not a secret")
            fd = os.open(file, os.O_RDONLY)
            try:
                value = h.Runner().execute(
                    [sys.executable, "-c", f"import os;print(os.fstat({fd}).st_ino)"],
                    Path.cwd(),
                    pass_fds=(fd,),
                )
                self.assertEqual(int(value), file.stat().st_ino)
            finally:
                os.close(fd)

    def test_worker_launcher_uses_canonical_script_and_private_output(self):
        obj = h.Host.__new__(h.Host)
        events = []

        class Run:
            def execute(self, argv, cwd, **kwargs):
                events.append((argv, str(cwd), kwargs))
                return "PRIVATE OUTPUT"

        obj.runner = Run()
        obj.check_worker_identity = lambda: None
        obj.check_worker_release = lambda: None
        obj.run_worker("ingest", (99,))
        argv, cwd, kwargs = events[0]
        self.assertEqual(argv, ["/usr/bin/bash", "ops/ingest.sh"])
        self.assertTrue(cwd.endswith("/var/lib/probono-radar/app/apps/probono"))
        self.assertEqual(kwargs["pass_fds"], (99,))
        self.assertIn("/usr/local/libexec/policai-host/bin", kwargs["extra_env"]["PATH"])
        with self.assertRaises(d.Refused):
            obj.run_worker("digest", (99,))


if __name__ == "__main__":
    unittest.main()
