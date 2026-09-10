"""Fixed host adapters. No command strings, inherited environment or raw logs.

Runner.execute is an internal API; the CLI never accepts executable names.
Tests use it with harmless fixture processes. Installed code must be root-owned.
"""

import hashlib
import json
import os
import pwd
import re
import selectors
import shutil
import signal
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path

from dispatcher import Refused, State, promote, secure_path, sha, sync_dir, undo_promote

STATE = Path("/var/lib/policai-deploy-state")
CONFIG = Path("/etc/policai-deploy/config.json")
USER_UNITS = Path("/home/l0cka/.config/systemd/user")
UNIT_VIEW = Path("/run/policai-deploy-observation/user-units")
ENV_FILE = Path("/etc/probono-radar/runtime.env")
CODE = Path("/usr/local/libexec/policai-host")
BASES = {"policai": Path("/var/lib/policai"), "probono": Path("/var/lib/probono-radar")}
USERS = {"policai": "policai", "probono": "l0cka"}
DB = "probono-radar-db-1"
DASHBOARD = "probono-radar-dashboard-1"
DEPLOY_CLIENT_ENV = {
    "HOME": "/var/lib/probono-radar",
    "DOCKER_CONFIG": "/var/lib/probono-radar/.docker",
}


def user_unit_directory():
    # The system unit binds only this source directory read-only OUTSIDE /home.
    # Direct operator CLI use observes canonical files without a synthetic mirror.
    return UNIT_VIEW if UNIT_VIEW.is_dir() else USER_UNITS


def image_id(value):
    if not isinstance(value, str) or not re.fullmatch("sha256:[0-9a-f]{64}", value):
        raise Refused("invalid image identity")
    return value


def overlay(dashboard, worker):
    for value in (dashboard, worker):
        if not re.fullmatch(
            r"(sha256:[0-9a-f]{64}|probono-radar-(dashboard|worker):candidate-[0-9a-f]{32})",
            value,
        ):
            raise Refused("invalid release image")
    return {
        "services": {
            "dashboard": {"image": dashboard, "pull_policy": "never"},
            "worker": {"image": worker, "pull_policy": "never"},
        },
        "volumes": {"pgdata": {"external": True, "name": "probono-radar_pgdata"}},
        "networks": {"default": {"external": True, "name": "probono-radar_default"}},
    }


def check_root_health(text):
    try:
        data = json.loads(text)
        if data.get("success") is not True or not isinstance(data.get("collection"), dict):
            raise ValueError()
    except (ValueError, AttributeError):
        raise Refused("root readiness response invalid") from None


def check_child_health(text):
    if (
        "Source health" not in text
        or "<table" not in text
        or any(
            error in text
            for error in (
                "Internal Server Error",
                "NEXT_HTTP_ERROR_FALLBACK",
                "Application error:",
            )
        )
    ):
        raise Refused("child readiness response invalid")


def check_compose_source(app, digest):
    path = app / "docker-compose.yaml"
    if path.is_symlink() or path.resolve() != path or not path.is_file():
        raise Refused("unsafe Compose source")
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise Refused("Compose source requires new review")


def worker_arguments(args):
    backup = [
        "compose",
        "-f",
        "/var/lib/probono-radar/app/apps/probono/docker-compose.yaml",
        "exec",
        "-T",
        "db",
        "pg_dump",
        "-U",
        "radar",
        "radar",
    ]
    if args == backup:
        return args[3:]
    prefix = ["compose", "--profile", "worker", "run", "--rm"]
    if args[:5] != prefix:
        raise Refused("worker command not allowlisted")
    rest = args[5:]
    if rest[:1] == ["-T"]:
        rest = rest[1:]
    if len(rest) < 2 or rest[0] != "worker":
        raise Refused("worker service required")
    task, params = rest[1], rest[2:]
    if task in ("src/fetch-all.ts", "src/list-unenriched.ts") and not params:
        pass
    elif (
        task == "src/save-enrichment.ts"
        and len(params) == 1
        and re.fullmatch("[1-9][0-9]{0,12}", params[0])
    ):
        pass
    else:
        raise Refused("worker task not allowlisted")
    return [
        "run",
        "--no-deps",
        "--pull",
        "never",
        "--rm",
        "-T",
        "worker",
        task,
        *params,
    ]


class Host:
    def __init__(self, config, state=None, runner=None):
        self.config = config
        self.runner = runner or Runner()
        self.state = state if state is not None else State(STATE)
        self.checkpoint = lambda phase: None

    def git(self, lane, *args, cwd=None):
        if lane not in BASES:
            raise Refused("unknown lane")
        return self.runner.execute(
            [
                "/usr/bin/git",
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "protocol.file.allow=never",
                "-c",
                "credential.helper=",
                "-c",
                "http.extraHeader=",
                *args,
            ],
            cwd or BASES[lane] / "app",
            identity=USERS[lane],
            extra_env={"HOME": str(BASES[lane])},
            timeout=180,
        )

    def docker(self, *args, timeout=60):
        return self.runner.execute(
            ["/usr/bin/docker", *args],
            "/",
            identity="l0cka",
            timeout=timeout,
            extra_env=DEPLOY_CLIENT_ENV,
        )

    def system(self, *args):
        if args[0] not in ("show", "stop", "start", "is-active") or args[-1] != "policai.service":
            raise Refused("system command out of scope")
        return self.runner.execute(["/usr/bin/systemctl", *args], "/", timeout=120).strip()

    def compose(self, app, selection, *args, timeout=180):
        return self.runner.execute(
            self.compose_argv(app, selection) + list(args),
            app,
            identity="l0cka",
            extra_env=DEPLOY_CLIENT_ENV,
            timeout=timeout,
            limit=16_000_000,
        )

    def check_repo(self, lane, path=None):
        path = path or BASES[lane] / "app"
        account = pwd.getpwnam(USERS[lane])
        secure_path(path, account.pw_uid, directory=True)
        secure_path(path / ".git", account.pw_uid, directory=True)

        def git(*args):
            return self.git(lane, *args, cwd=path).strip()

        allowed = {
            "core.repositoryformatversion",
            "core.filemode",
            "core.bare",
            "core.logallrefupdates",
            "remote.origin.url",
            "remote.origin.fetch",
            "branch.main.remote",
            "branch.main.merge",
            "user.name",
            "user.email",
        }
        if set(git("config", "--local", "--name-only", "--list").lower().splitlines()) - allowed:
            raise Refused("unreviewed local Git configuration")
        if git("remote", "get-url", "origin") != self.config["remote"]:
            raise Refused("release remote mismatch")
        if git("symbolic-ref", "--quiet", "HEAD") != "refs/heads/main":
            raise Refused("release must be on main")
        if git("status", "--porcelain=v1", "--untracked-files=all"):
            raise Refused("release checkout dirty")
        if (path / ".gitmodules").exists() or any(
            (path / ".git" / x).exists()
            for x in (
                "MERGE_HEAD",
                "CHERRY_PICK_HEAD",
                "REBASE_HEAD",
                "rebase-merge",
                "rebase-apply",
                "index.lock",
                "shallow",
                "info/sparse-checkout",
            )
        ):
            raise Refused("unsupported Git operation or checkout")
        listing = git("ls-files", "-v", "-z")
        if any(row and row[0] != "H" for row in listing.split("\0")):
            raise Refused("concealed index entries")
        return sha(git("rev-parse", "--verify", "HEAD"))

    def resolve_target(self):
        if self.config.get("follow_main") is not True:
            raise Refused("automatic main tracking lacks approval")
        self.check_repo("policai")
        self.git(
            "policai", "fetch", "--quiet", "origin", "refs/heads/main:refs/remotes/origin/main"
        )
        return sha(
            self.git(
                "policai", "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"
            ).strip()
        )

    def prepare(self, target):
        if (
            sha(target) != self.config["approved_target"]
            and self.config.get("follow_main") is not True
        ):
            raise Refused("target lacks current deployment approval")
        previous, paths = {}, set()
        for lane in BASES:
            previous[lane] = self.check_repo(lane)
            self.git(
                lane,
                "fetch",
                "--quiet",
                "origin",
                "refs/heads/main:refs/remotes/origin/main",
            )
            if (
                self.git(lane, "rev-parse", "--verify", "refs/remotes/origin/main^{commit}").strip()
                != target
            ):
                raise Refused("approved target is not fetched main")
            self.git(lane, "merge-base", "--is-ancestor", previous[lane], target)
            raw = self.git(
                lane,
                "diff",
                "--no-renames",
                "--name-only",
                "-z",
                previous[lane],
                target,
                "--",
            )
            if raw and not raw.endswith("\0"):
                raise Refused("incomplete changed path response")
            paths.update(raw[:-1].split("\0") if raw else [])
        return {"previous": previous, "paths": sorted(paths)}

    def inspect_container(self, name):
        # Deliberately omit Config.Env, commands and health logs.
        fmt = '[{"Id":{{json .Id}},"Image":{{json .Image}},"State":{"Status":{{json .State.Status}},"Health":{"Status":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}},"Mounts":{{json .Mounts}},"Config":{"Labels":{{json .Config.Labels}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}]'
        return json.loads(self.docker("inspect", "--format", fmt, name))[0]

    def verify_database(self):
        expected = self.config["db"]
        db = self.inspect_container(DB)
        mounts = db["Mounts"]
        if (
            db["Id"] != expected["id"]
            or db["Image"] != expected["image"]
            or db["State"]["Status"] != "running"
            or db["State"]["Health"]["Status"] != "healthy"
            or len(mounts) != 1
            or mounts[0]["Type"] != "volume"
            or mounts[0]["Name"] != "probono-radar_pgdata"
            or mounts[0]["Destination"] != "/var/lib/postgresql/data"
            or mounts[0]["RW"] is not True
            or db["NetworkSettings"]["Ports"]
            != {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5433"}]}
            or db["Config"]["Labels"].get("com.docker.compose.project") != "probono-radar"
            or db["Config"]["Labels"].get("com.docker.compose.service") != "db"
        ):
            raise Refused("database identity or boundary changed")
        volume = json.loads(
            self.docker(
                "volume",
                "inspect",
                "--format",
                '[{"Name":{{json .Name}},"Driver":{{json .Driver}}}]',
                "probono-radar_pgdata",
            )
        )[0]
        if volume != {"Name": "probono-radar_pgdata", "Driver": "local"}:
            raise Refused("external database volume unavailable")
        network = json.loads(
            self.docker(
                "network",
                "inspect",
                "--format",
                '[{"Name":{{json .Name}}}]',
                "probono-radar_default",
            )
        )[0]
        if network != {"Name": "probono-radar_default"}:
            raise Refused("existing network unavailable")
        cluster = (
            self.docker(
                "exec",
                DB,
                "psql",
                "-X",
                "-U",
                "radar",
                "-d",
                "radar",
                "-Atc",
                "BEGIN READ ONLY; SELECT system_identifier FROM pg_control_system(); COMMIT;",
            )
            .strip()
            .splitlines()
        )
        # psql command tags may precede/follow the single result.
        if [x for x in cluster if x not in ("BEGIN", "COMMIT")] != [expected["cluster"]]:
            raise Refused("database cluster identity mismatch")

    def preflight(self, active):
        envstat = secure_path(ENV_FILE)
        if envstat.st_mode & 0o007 or envstat.st_mode & 0o020:
            raise Refused("external environment file permissions unsafe")
        self.runner.execute(["/usr/bin/test", "-r", str(ENV_FILE)], "/", identity="l0cka")
        for lane, base in BASES.items():
            secure_path(base, pwd.getpwnam(USERS[lane]).pw_uid, directory=True)
            for directory in (
                STATE / "artifacts" / lane / "candidates",
                STATE / "artifacts" / lane / "retained",
            ):
                secure_path(directory, directory=True)
                if directory.stat().st_dev != base.stat().st_dev:
                    raise Refused("artifact swap crosses filesystems")
            if shutil.disk_usage(base).free < self.config["min_free_bytes"]:
                raise Refused("insufficient staging and rollback disk")
            if self.check_repo(lane) != active["heads"][lane]:
                raise Refused("release HEAD differs from verified baseline")
        required = {
            str(CODE / "cli.py"),
            str(CODE / "host.py"),
            str(CODE / "dispatcher.py"),
            str(CODE / "bin/docker"),
            str(CODE / "backup.sh"),
            "/etc/systemd/system/policai-pull.service",
            "/home/l0cka/.config/systemd/user/probono-ingest.service",
            "/home/l0cka/.config/systemd/user/probono-enrich.service",
            "/home/l0cka/.config/systemd/user/probono-backup.service",
        }
        if not required.issubset(self.config["installed_hashes"]):
            raise Refused("guarded entrypoint installation proof missing")
        for filename, digest in self.config["installed_hashes"].items():
            # Exact allowlist avoids reading arbitrary files from a config mistake.
            if filename not in required:
                raise Refused("unapproved installation hash target")
            path = Path(filename)
            is_user_unit = path.parent == USER_UNITS
            if is_user_unit:
                path = user_unit_directory() / path.name
            owner = pwd.getpwnam("l0cka").pw_uid if is_user_unit else 0
            secure_path(path, owner)
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise Refused("installed guarded entrypoint differs from approval")
        for unit in ("probono-digest.service", "probono-digest.timer"):
            path = user_unit_directory() / unit
            if not path.is_symlink() or os.readlink(path) != "/dev/null":
                raise Refused("digest must remain masked")
        jobs = self.docker(
            "ps",
            "--filter",
            "label=com.docker.compose.project=probono-radar",
            "--filter",
            "label=com.docker.compose.service=worker",
            "--format",
            "{{.ID}}",
        )
        if jobs.strip():
            raise Refused("ungated worker still running")
        self.health_snapshot(active)

    def candidate_paths(self, lane, record):
        if not re.fullmatch("[0-9a-f]{32}", record["id"]):
            raise Refused("invalid transaction identity")
        artifact = STATE / "artifacts" / lane
        return (
            artifact / "candidates" / record["id"] / "app",
            BASES[lane] / "app",
            artifact / "retained" / record["id"] / "app",
            artifact / "retained" / record["id"] / "failed",
        )

    def stage(self, record, lanes):
        for lane in sorted(lanes):
            candidate, active, old, failed = self.candidate_paths(lane, record)
            account = pwd.getpwnam(USERS[lane])
            candidate.parent.mkdir(mode=0o750)
            os.chown(candidate.parent, account.pw_uid, account.pw_gid)
            old.parent.mkdir(mode=0o755)
            sync_dir(candidate.parent.parent)
            sync_dir(old.parent.parent)
            self.git(
                lane,
                "clone",
                "--no-checkout",
                "--branch",
                "main",
                "--",
                self.config["remote"],
                str(candidate),
                cwd=candidate.parent,
            )
            self.git(lane, "checkout", "-B", "main", record["target"], cwd=candidate)
            if self.check_repo(lane, candidate) != record["target"]:
                raise Refused("staged revision mismatch")
            if lane == "policai":
                for args in (
                    ["/usr/bin/npm", "ci", "--no-audit", "--no-fund"],
                    ["/usr/bin/npm", "run", "build"],
                ):
                    self.runner.execute(
                        args,
                        candidate,
                        identity="policai",
                        timeout=900,
                        limit=32_000_000,
                    )
                buildid = candidate / ".next/BUILD_ID"
                secure_path(buildid, account.pw_uid)
                record["root_build"] = buildid.read_text().strip()
            else:
                app = candidate / "apps/probono"
                check_compose_source(app, self.config["compose_sha256"])
                tags = {
                    service: "probono-radar-" + service + ":candidate-" + record["id"]
                    for service in ("dashboard", "worker")
                }
                self.state.write(
                    "candidate-compose.json", overlay(tags["dashboard"], tags["worker"])
                )
                self.validate_compose(app, "candidate")
                self.compose(app, "candidate", "build", "dashboard", "worker", timeout=1200)
                record["images"] = {
                    service: image_id(
                        self.docker("image", "inspect", "--format", "{{.Id}}", tag).strip()
                    )
                    for service, tag in tags.items()
                }
            self.checkpoint(lane + ":built")
        # No fast-forward or activation has occurred before this barrier.

    def validate_compose(self, app, selection):
        check_compose_source(app, self.config["compose_sha256"])
        cfg = json.loads(self.compose(app, selection, "config", "--format", "json"))
        if cfg.get("name") != "probono-radar" or set(cfg["services"]) != {
            "db",
            "dashboard",
            "worker",
        }:
            raise Refused("unexpected Compose project/services")
        if (
            cfg["volumes"]["pgdata"].get("name") != "probono-radar_pgdata"
            or cfg["volumes"]["pgdata"].get("external") is not True
        ):
            raise Refused("external volume contract changed")
        if (
            cfg["networks"]["default"].get("name") != "probono-radar_default"
            or cfg["networks"]["default"].get("external") is not True
        ):
            raise Refused("existing network contract changed")
        for service, port, target in (
            ("db", "5433", 5432),
            ("dashboard", "8850", 3000),
        ):
            item = cfg["services"][service]
            ports = item.get("ports", [])
            if (
                len(ports) != 1
                or ports[0].get("host_ip") != "127.0.0.1"
                or str(ports[0].get("published")) != port
                or int(ports[0].get("target", 0)) != target
            ):
                raise Refused("non-loopback or changed port mapping")
        for service in ("dashboard", "worker"):
            item = cfg["services"][service]
            if (
                item.get("privileged")
                or item.get("cap_add")
                or item.get("devices")
                or item.get("volumes")
            ):
                raise Refused("unapproved application container access")
            if Path(item["build"]["context"]).resolve() != (app / service).resolve():
                raise Refused("build context escaped child application")
        if cfg["services"]["worker"].get("network_mode") != "host":
            raise Refused("worker networking changed")

    def activate(self, record, lanes):
        for lane in BASES:
            if self.check_repo(lane) != record["previous"][lane]:
                raise Refused("release changed during build")
        if "policai" in lanes:
            self.system("stop", "policai.service")
            if (
                self.system("show", "--property=ActiveState", "--value", "policai.service")
                != "inactive"
            ):
                raise Refused("Policai did not stop")
        for lane in BASES:
            if lane in lanes:
                candidate, active, old, failed = self.candidate_paths(lane, record)
                promote(
                    candidate,
                    active,
                    old,
                    lambda phase, lane=lane: self.checkpoint(lane + ":" + phase),
                )
            else:
                self.git(lane, "merge", "--ff-only", "--no-edit", record["target"])
                self.checkpoint(lane + ":fast-forwarded")
        if "policai" in lanes:
            self.system("start", "policai.service")
        if "probono" in lanes:
            images = record["images"]
            self.state.write("active-compose.json", overlay(images["dashboard"], images["worker"]))
            self.compose(
                BASES["probono"] / "app/apps/probono",
                "active",
                "up",
                "-d",
                "--no-deps",
                "--no-build",
                "--pull",
                "never",
                "dashboard",
            )
        self.checkpoint("runtimes-activated")

    def active_record(self, record):
        previous = record["before"]
        return {
            "heads": {lane: record["target"] for lane in BASES},
            "root_build": record.get("root_build", previous["root_build"]),
            "images": record.get("images", previous["images"]),
            "target": record["target"],
        }

    def wait_for_runtime(self, active):
        for attempt in range(30):
            if self.runtime_ready(active):
                return
            if attempt < 29:
                time.sleep(1)
        raise Refused("runtime readiness timed out")

    def runtime_ready(self, active):
        self.verify_database()
        service_state = self.system("show", "--property=ActiveState", "--value", "policai.service")
        if service_state not in {"active", "activating", "inactive"}:
            raise Refused("Policai inactive")
        ready = service_state == "active"
        build = BASES["policai"] / "app/.next/BUILD_ID"
        secure_path(build, pwd.getpwnam("policai").pw_uid)
        if build.read_text().strip() != active["root_build"]:
            raise Refused("root artifact build identity mismatch")
        dash = self.inspect_container(DASHBOARD)
        if (
            dash["Image"] != active["images"]["dashboard"]
            or dash["NetworkSettings"]["Ports"]
            != {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8850"}]}
            or dash["Config"]["Labels"].get("com.docker.compose.project") != "probono-radar"
        ):
            raise Refused("dashboard runtime identity mismatch")
        if dash["State"]["Status"] not in {"running", "created", "restarting"}:
            raise Refused("dashboard stopped unexpectedly")
        ready = ready and dash["State"]["Status"] == "running"
        self.docker(
            "image",
            "inspect",
            "--format",
            "{{.Id}}",
            image_id(active["images"]["worker"]),
        )
        # Socket binding is independent proof; systemd sandbox is not a listener.
        sockets = self.runner.execute(["/usr/bin/ss", "-H", "-ltn"], "/")
        for port in ("8794", "8850", "5433"):
            addresses = [
                line.split()[3]
                for line in sockets.splitlines()
                if len(line.split()) >= 4 and line.split()[3].endswith(":" + port)
            ]
            if not addresses and port != "5433":
                ready = False
            elif addresses != ["127.0.0.1:" + port]:
                raise Refused("application listener boundary mismatch")
        return ready

    def health_snapshot(self, active):
        self.wait_for_runtime(active)
        for url, check in (
            ("http://127.0.0.1:8794/api/status", check_root_health),
            ("http://127.0.0.1:8850/health", check_child_health),
        ):
            for attempt in range(6):
                try:
                    text = self.runner.execute(
                        [
                            "/usr/bin/curl",
                            "--noproxy",
                            "*",
                            "--fail",
                            "--silent",
                            "--max-time",
                            "5",
                            "--max-filesize",
                            "4000000",
                            url,
                        ],
                        "/",
                        timeout=7,
                    )
                    check(text)
                    break
                except Refused:
                    if attempt == 5:
                        raise
                    time.sleep(1)

    def health(self, record):
        for lane in BASES:
            if self.check_repo(lane) != record["target"]:
                raise Refused("post-activation release revision mismatch")
        self.health_snapshot(self.active_record(record))

    def rollback(self, record):
        # Before activation, there is nothing to roll back except the gate. If
        # activation partially ran, previous repo/artifact state is retained.
        lanes = set(record.get("lanes", []))
        if "previous" not in record or not record.get("activation_started"):
            return
        if "policai" in lanes:
            self.system("stop", "policai.service")
            if (
                self.system("show", "--property=ActiveState", "--value", "policai.service")
                != "inactive"
            ):
                raise Refused("Policai did not stop for recovery")
        for lane in BASES:
            candidate, active, old, failed = self.candidate_paths(lane, record)
            if lane in lanes and (old.exists() or failed.exists()):
                undo_promote(candidate, active, old, failed)
            elif lane not in lanes and self.check_repo(lane) != record["previous"][lane]:
                if self.check_repo(lane) != record["target"]:
                    raise Refused("recovery found unrelated release change")
                # One switch keeps HEAD attached even if the dispatcher dies
                # immediately afterwards. No detached intermediate recovery state.
                self.git(lane, "switch", "-C", "main", record["previous"][lane])
            self.checkpoint(lane + ":restored")
        if "probono" in lanes:
            images = record["before"]["images"]
            self.state.write("active-compose.json", overlay(images["dashboard"], images["worker"]))
            self.compose(
                BASES["probono"] / "app/apps/probono",
                "active",
                "up",
                "-d",
                "--no-deps",
                "--no-build",
                "--pull",
                "never",
                "dashboard",
            )
        if "policai" in lanes:
            self.system("start", "policai.service")

    def restored_health(self, record):
        for lane in BASES:
            if self.check_repo(lane) != record["before"]["heads"][lane]:
                raise Refused("restored source identity mismatch")
        self.health_snapshot(record["before"])

    def check_worker_identity(self):
        if os.geteuid() != pwd.getpwnam("l0cka").pw_uid:
            raise Refused("scheduled workers must execute as l0cka")

    def check_worker_release(self):
        active = self.state.require_ready()
        if active.get("bootstrap_pending"):
            raise Refused("initial activation incomplete")
        if self.check_repo("probono") != active["heads"]["probono"]:
            raise Refused("worker source differs from active release")
        expected = overlay(active["images"]["dashboard"], active["images"]["worker"])
        if self.state.read("active-compose.json") != expected:
            raise Refused("worker image selection differs from active release")
        self.validate_compose(BASES["probono"] / "app/apps/probono", "active")
        self.verify_database()
        self.docker(
            "image",
            "inspect",
            "--format",
            "{{.Id}}",
            image_id(active["images"]["worker"]),
        )

    def run_worker(self, name, lockfds):
        if name not in ("ingest", "enrich", "backup"):
            raise Refused("scheduled command out of scope")
        self.check_worker_identity()
        self.check_worker_release()
        app = BASES["probono"] / "app/apps/probono"
        script = str(CODE / "backup.sh") if name == "backup" else "ops/" + name + ".sh"
        self.runner.execute(
            ["/usr/bin/bash", script],
            app,
            identity="l0cka",
            timeout=1800,
            limit=16_000_000,
            pass_fds=lockfds,
            extra_env={
                "PATH": str(CODE / "bin") + ":/home/l0cka/.local/bin:/usr/bin:/bin",
                "PROBONO_DOCKER_BIN": str(CODE / "bin/docker"),
                "PROBONO_CLAUDE_BIN": "/home/l0cka/.local/bin/claude",
            },
        )
        # Do not return or journal worker output, which can contain article data.

    def worker_compose(self, args, lockfds, stdin_data=None):
        self.check_worker_identity()
        self.check_worker_release()
        allowed = worker_arguments(args)
        backup = allowed[0] == "exec"

        if stdin_data is not None and "src/save-enrichment.ts" not in allowed:
            raise Refused("unexpected worker stdin")
        app = BASES["probono"] / "app/apps/probono"
        return self.runner.execute(
            self.compose_argv(app, "active") + allowed,
            app,
            identity="l0cka",
            timeout=1200,
            limit=134217728 if backup else 4_000_000,
            pass_fds=lockfds,
            stdin_data=stdin_data,
        )

    def compose_argv(self, app, selection):
        if selection not in ("active", "candidate"):
            raise Refused("invalid Compose selection")
        return [
            "/usr/bin/docker",
            "compose",
            "--project-name",
            "probono-radar",
            "--env-file",
            str(ENV_FILE),
            "-f",
            str(app / "docker-compose.yaml"),
            "-f",
            str(STATE / (selection + "-compose.json")),
            "--profile",
            "worker",
        ]


@contextmanager
def worker_guard(state, serialize=True):
    # User services cannot write trusted state. They take read-open SH locks;
    # deploy takes EX. The inode remains stable across every transaction.
    with state.lock(exclusive=False) as fd:
        active = state.require_ready()
        if active.get("bootstrap_pending"):
            raise Refused("initial activation incomplete")
        if not serialize:
            yield (fd,)
            return
        with state.lock(exclusive=True, worker=True) as workfd:
            yield (fd, workfd)


class Runner:
    def identity_argv(self, identity, argv, extra_env=None):
        homes = {"policai": "/var/lib/policai", "l0cka": "/home/l0cka"}
        if identity not in homes:
            raise Refused("unapproved command identity")
        clean = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": homes[identity],
            "LANG": "C.UTF-8",
            "NEXT_TELEMETRY_DISABLED": "1",
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": "/dev/null",
        }
        clean.update(extra_env or {})
        command = [
            "/usr/bin/env",
            "-i",
            *(key + "=" + value for key, value in clean.items()),
            *argv,
        ]
        if os.geteuid() == pwd.getpwnam(identity).pw_uid:
            return command
        return ["/usr/bin/runuser", "-u", identity, "--", *command]

    def execute(
        self,
        argv,
        cwd,
        timeout=60,
        limit=4_000_000,
        identity=None,
        env=None,
        extra_env=None,
        stdin_data=None,
        pass_fds=(),
    ):
        if stdin_data is not None and (
            not isinstance(stdin_data, bytes) or len(stdin_data) > 262144
        ):
            raise Refused("command input exceeds bound")
        if identity is not None:
            argv = self.identity_argv(identity, argv, extra_env)
        clean = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
        clean.update(env or {})
        if identity is None:
            clean.update(extra_env or {})
        process = None
        try:
            process = subprocess.Popen(
                argv,
                cwd=cwd,
                env=clean,
                stdin=subprocess.PIPE if stdin_data is not None else subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
                close_fds=True,
                pass_fds=pass_fds,
            )
            deadline = time.monotonic() + timeout
            output, count, position = bytearray(), 0, 0
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ, "stdout")
                selector.register(process.stderr, selectors.EVENT_READ, "stderr")
                if process.stdin:
                    selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise Refused("command timed out")
                    for key, _ in selector.select(min(remaining, 0.2)):
                        if key.data == "stdin":
                            if position < len(stdin_data):
                                position += os.write(key.fd, stdin_data[position : position + 4096])
                            if position == len(stdin_data):
                                selector.unregister(key.fileobj)
                                process.stdin.close()
                            continue
                        data = os.read(key.fd, 65536)
                        if not data:
                            selector.unregister(key.fileobj)
                            continue
                        count += len(data)
                        if count > limit:
                            raise Refused("command output exceeded bound")
                        if key.data == "stdout":
                            output.extend(data)
                result = process.wait(timeout=max(0.01, deadline - time.monotonic()))
            if result:
                raise Refused("command failed")
            return output.decode("utf-8", errors="strict")
        except Refused:
            raise
        except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
            raise Refused("command unavailable or timed out") from None
        finally:
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
                for stream in (process.stdout, process.stderr, process.stdin):
                    if stream:
                        stream.close()
