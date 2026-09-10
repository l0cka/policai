import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_transaction import FixtureState

import dispatcher as d
import host as h

OLD = "a" * 40
NEW = "b" * 40
IMG = "sha256:" + "c" * 64
WIMG = "sha256:" + "d" * 64
DBID = "e" * 64


def db_fixture():
    return {
        "Id": DBID,
        "Image": IMG,
        "State": {"Status": "running", "Health": {"Status": "healthy"}},
        "Mounts": [
            {
                "Type": "volume",
                "Name": "probono-radar_pgdata",
                "Destination": "/var/lib/postgresql/data",
                "RW": True,
            }
        ],
        "Config": {
            "Labels": {
                "com.docker.compose.project": "probono-radar",
                "com.docker.compose.service": "db",
            }
        },
        "NetworkSettings": {"Ports": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5433"}]}},
    }


class HostIntegrationTests(unittest.TestCase):
    def setUp(self):
        original = d.secure_path
        self.p = patch.object(
            d,
            "secure_path",
            side_effect=lambda *a, **kw: original(*a, **dict(kw, ancestors=False)),
        )
        self.p.start()
        self.addCleanup(self.p.stop)

    def test_existing_database_identity_rejected_on_any_changed_dimension(self):
        self.assertTrue(hasattr(h.Host, "verify_database"), "database identity adapter missing")
        obj = h.Host.__new__(h.Host)
        obj.config = {"db": {"id": DBID, "image": IMG, "cluster": "1234"}}
        good = db_fixture()
        for change in (None, "id", "mount", "bind", "health", "cluster"):
            data = copy.deepcopy(good)
            if change == "id":
                data["Id"] = "f" * 64
            if change == "mount":
                data["Mounts"][0]["Name"] = "other"
            if change == "bind":
                data["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostIp"] = "0.0.0.0"
            if change == "health":
                data["State"]["Health"]["Status"] = "unhealthy"

            def docker(*args, data=data, change=change, **kwargs):
                if args[:1] == ("inspect",):
                    return json.dumps([data])
                if args[:2] == ("volume", "inspect"):
                    return '[{"Name":"probono-radar_pgdata","Driver":"local"}]'
                if args[:2] == ("network", "inspect"):
                    return '[{"Name":"probono-radar_default"}]'
                return "wrong" if change == "cluster" else "1234"

            obj.docker = docker
            with self.subTest(change=change):
                if change:
                    with self.assertRaises(d.Refused):
                        obj.verify_database()
                else:
                    obj.verify_database()

    def test_prepare_rejects_remote_mismatch_and_uses_nul_diff(self):
        self.assertTrue(hasattr(h.Host, "prepare"), "Git preparation adapter missing")
        obj = h.Host.__new__(h.Host)
        obj.config = {"approved_target": NEW}
        calls = []
        obj.check_repo = lambda lane: OLD

        def git(lane, *args, **kw):
            calls.append(args)
            if args[0] == "rev-parse":
                return NEW
            if args[0] == "diff":
                return "src/deleted\0apps/probono/new\0"
            return ""

        obj.git = git
        result = obj.prepare(NEW)
        self.assertEqual(set(result["paths"]), {"src/deleted", "apps/probono/new"})
        self.assertTrue(any("--no-renames" in x and "-z" in x for x in calls))
        obj.config = {"approved_target": OLD}
        with self.assertRaises(d.Refused):
            obj.prepare(NEW)

    def test_host_constructor_uses_state_not_as_command_runner(self):
        state = object()
        obj = h.Host({}, state=state)
        self.assertIs(obj.state, state)
        self.assertIsInstance(obj.runner, h.Runner)

    def test_rollback_of_failed_build_never_restarts_runtime(self):
        obj = h.Host.__new__(h.Host)
        obj.system = lambda *args: self.fail("unnecessary runtime change after failed build")
        obj.rollback(
            {
                "previous": {"policai": OLD, "probono": OLD},
                "lanes": ["policai", "probono"],
            }
        )

    def test_worker_command_has_supported_flags_once(self):
        obj = h.Host.__new__(h.Host)
        events = []
        obj.check_worker_identity = lambda: None
        obj.check_worker_release = lambda: None

        class Run:
            def execute(self, argv, *args, **kwargs):
                events.append(argv)
                return "[]"

        obj.runner = Run()
        obj.worker_compose(
            [
                "compose",
                "--profile",
                "worker",
                "run",
                "--rm",
                "worker",
                "src/list-unenriched.ts",
            ],
            (),
        )
        command = events[0]
        self.assertNotIn("--no-build", command)
        self.assertEqual(command.count("--no-deps"), 1)
        self.assertEqual(command.count("--pull"), 1)

    def test_staged_artifacts_are_outside_app_writable_parents(self):
        obj = h.Host.__new__(h.Host)
        for lane in h.BASES:
            candidate, active, old, failed = obj.candidate_paths(lane, {"id": "1" * 32})
            self.assertTrue(candidate.is_relative_to(h.STATE / "artifacts"))
            self.assertTrue(old.is_relative_to(h.STATE / "artifacts"))
            self.assertFalse(old.is_relative_to(h.BASES[lane]))

    def test_activation_stops_root_before_real_swap_and_never_touches_db(self):
        self.assertTrue(hasattr(h.Host, "activate"), "activation adapter missing")
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            bases = {k: base / k for k in ("policai", "probono")}
            for lane, b in bases.items():
                (b / "app").mkdir(parents=True)
                (b / "app" / "version").write_text("old")
                artifact = base / "state" / "artifacts" / lane
                candidate = artifact / "candidates" / ("1" * 32) / "app"
                candidate.mkdir(parents=True)
                (candidate / "version").write_text("new")
                (artifact / "retained" / ("1" * 32)).mkdir(parents=True)
            sroot = base / "state"
            s = FixtureState(sroot)
            obj = h.Host.__new__(h.Host)
            obj.state = s
            obj.config = {}
            events = []
            obj.check_repo = lambda lane: OLD
            obj.checkpoint = lambda p: events.append(p)
            obj.system = lambda *args: (
                events.append(" ".join(args)) or ("inactive" if args[0] == "show" else "")
            )
            obj.compose = lambda *args, **kw: events.append(("compose", args)) or ""
            obj.git = lambda *args, **kw: ""
            record = {
                "id": "1" * 32,
                "target": NEW,
                "previous": {k: OLD for k in bases},
                "images": {"dashboard": IMG, "worker": WIMG},
                "lanes": list(bases),
            }
            with patch.object(h, "BASES", bases), patch.object(h, "STATE", sroot):
                obj.activate(record, set(bases))
            self.assertLess(
                events.index("stop policai.service"),
                events.index("policai:old-retained"),
            )
            for lane, b in bases.items():
                self.assertEqual((b / "app" / "version").read_text(), "new")
                self.assertEqual(
                    (
                        sroot / "artifacts" / lane / "retained" / ("1" * 32) / "app" / "version"
                    ).read_text(),
                    "old",
                )
            commands = [e for e in events if isinstance(e, tuple)]
            self.assertTrue(any("--no-deps" in e[1] for e in commands))
            self.assertFalse(any("db" in e[1] for e in commands))
