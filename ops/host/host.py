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
from urllib.parse import unquote, urlsplit

from dispatcher import (
    Refused,
    State,
    parse_active,
    promote,
    secure_path,
    sha,
    sync_dir,
    undo_promote,
)

STATE = Path("/var/lib/policai-deploy-state")
CONFIG = Path("/etc/policai-deploy/config.json")
USER_UNITS = Path("/home/l0cka/.config/systemd/user")
UNIT_VIEW = Path("/run/policai-deploy-observation/user-units")
ENV_FILE = Path("/etc/probono-radar/runtime.env")
NEON_ENV_FILE = Path("/etc/probono-radar/neon.env")
CODE = Path("/usr/local/libexec/policai-host")
BASES = {"probono": Path("/var/lib/probono-radar")}
USERS = {"probono": "l0cka"}
DB = "probono-radar-db-1"
SETPRIV = "/usr/bin/setpriv"
LOGIN_UMASK = 0o022
DEPLOY_CLIENT_ENV = {
    "HOME": "/var/lib/probono-radar",
    "DOCKER_CONFIG": "/var/lib/probono-radar/.docker",
}


WORKER_SCRIPTS = {
    "ingest": "ops/ingest.sh",
    "enrich": "ops/enrich.sh",
    "backup": str(CODE / "backup.sh"),
    "backup-mirror": str(CODE / "backup-mirror.sh"),
    "verify-deadlines": "ops/verify-deadlines.sh",
}
WORKER_GUARDS = {
    "ingest": "release",
    "enrich": "release",
    "verify-deadlines": "release",
    "backup": "database",
    "backup-mirror": "mirror",
    "neon-sync": "database",
}


def mirror_environment(config):
    paths = config["backup_mirror"]
    for key in ("source", "mount", "destination"):
        value = paths[key]
        if (
            not isinstance(value, str)
            or not value.startswith("/")
            or os.path.normpath(value) != value
        ):
            raise Refused("backup mirror path invalid")
    mount = Path(paths["mount"])
    if (
        mount == Path("/")
        or mount not in Path(paths["destination"]).parents
        or mount in Path(paths["source"]).parents
    ):
        raise Refused("backup mirror must write beneath a separate mount")
    return {
        "PROBONO_MIRROR_SOURCE": paths["source"],
        "PROBONO_MIRROR_MOUNT": paths["mount"],
        "PROBONO_MIRROR_DESTINATION": paths["destination"],
    }


def user_unit_directory():
    # The system unit binds only this source directory read-only OUTSIDE /home.
    # Direct operator CLI use observes canonical files without a synthetic mirror.
    return UNIT_VIEW if UNIT_VIEW.is_dir() else USER_UNITS


def image_id(value):
    if not isinstance(value, str) or not re.fullmatch("sha256:[0-9a-f]{64}", value):
        raise Refused("invalid image identity")
    return value


def overlay(worker):
    if not re.fullmatch(
        r"(sha256:[0-9a-f]{64}|probono-radar-worker:candidate-[0-9a-f]{32})", worker
    ):
        raise Refused("invalid release image")
    return {
        "services": {"worker": {"image": worker, "pull_policy": "never"}},
        "volumes": {"pgdata": {"external": True, "name": "probono-radar_pgdata"}},
        "networks": {"default": {"external": True, "name": "probono-radar_default"}},
    }


def check_compose_source(app, digest):
    path = app / "docker-compose.yaml"
    if path.is_symlink() or path.resolve() != path or not path.is_file():
        raise Refused("unsafe Compose source")
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise Refused("Compose source requires new review")


WORKER_LOCK_WAIT_SECONDS = 120


class ProcessFailed(Refused):
    pass


class TaskFailed(Refused):
    pass


@contextmanager
def worker_task(name):
    try:
        yield
    except ProcessFailed as error:
        raise TaskFailed(f"{name}: {error}") from None


# Worker tasks that read one bounded JSON payload from stdin.
STDIN_TASKS = ("src/save-enrichment.ts", "src/save-deadline-verification.ts")


BACKUP_EXEC = [
    "compose",
    "-f",
    "/var/lib/probono-radar/app/apps/probono/docker-compose.yaml",
    "exec",
    "-T",
    "db",
]
BACKUP_DUMPS = (
    ["pg_dump", "-U", "radar", "radar"],
    ["pg_dumpall", "-U", "radar", "--globals-only"],
)


# The A2J site reads a copy of the radar database on Neon. Argus stays the
# database of record: this replaces the copy whole, inside one transaction, and
# only when the dump differs from the last one copied. pg_dump runs over the
# container's socket with -h, so the NEON_* variables cannot redirect it, and a
# dump without its completion line is never sent. The password arrives on stdin,
# never in argv or the environment. The \restrict lines carry a fresh random
# key each run, so they are left out of the change digest.
NEON_SYNC_SCRIPT = r"""set -eu
set -o pipefail
umask 077
IFS= read -r NEON_PASSWORD
dump=$(mktemp /tmp/neon-sync.XXXXXX)
trap 'rm -f "$dump"' EXIT
pg_dump -h /var/run/postgresql -U radar --no-owner --no-acl radar > "$dump"
grep -qx -- '-- PostgreSQL database dump complete' "$dump"
digest=$(grep -Ev '^[\](un)?restrict ' "$dump" | sha256sum | cut -d' ' -f1)
if [ "$(cat /tmp/neon-sync.sha256 2>/dev/null || true)" = "$digest" ]; then
  echo unchanged
  exit 0
fi
{ printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; cat "$dump"; } \
  | PGPASSWORD="$NEON_PASSWORD" PGSSLMODE=verify-full PGSSLROOTCERT=system \
    psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
      -h "$NEON_HOST" -U "$NEON_USER" -d "$NEON_DATABASE" > /dev/null
printf '%s\n' "$digest" > /tmp/neon-sync.sha256
echo synced
"""
NEON_HOST = re.compile(r"ep-[a-z0-9-]+\.[a-z0-9-]+\.aws\.neon\.tech")
NEON_NAME = re.compile(r"[A-Za-z0-9_]{1,63}")


def neon_environment(text):
    """Parse the one NEON_DATABASE_URL line into the sync's NEON_* variables."""
    urls = [
        line[len("NEON_DATABASE_URL=") :]
        for line in text.splitlines()
        if line.startswith("NEON_DATABASE_URL=")
    ]
    if len(urls) != 1:
        raise Refused("exactly one NEON_DATABASE_URL required")
    url = urlsplit(urls[0].strip())
    password = unquote(url.password or "")
    if (
        url.scheme not in ("postgres", "postgresql")
        or not NEON_HOST.fullmatch(url.hostname or "")
        or "-pooler." in (url.hostname or "")
        or url.port not in (None, 5432)
        or not NEON_NAME.fullmatch(unquote(url.username or ""))
        or not NEON_NAME.fullmatch(url.path.lstrip("/"))
        or not re.fullmatch(r"[\x21-\x7e]{8,256}", password)
    ):
        raise Refused("NEON_DATABASE_URL must be a direct Neon endpoint")
    return {
        "NEON_HOST": url.hostname,
        "NEON_USER": unquote(url.username),
        "NEON_PASSWORD": password,
        "NEON_DATABASE": url.path.lstrip("/"),
    }


def compose_guard(args):
    return "database" if worker_arguments(args)[0] == "exec" else "release"


def worker_arguments(args):
    if args[:6] == BACKUP_EXEC and args[6:] in BACKUP_DUMPS:
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
    if (
        task in ("src/fetch-all.ts", "src/list-unenriched.ts", "src/verify-deadlines.ts")
        and not params
    ):
        pass
    elif task in STDIN_TASKS and len(params) == 1 and re.fullmatch("[1-9][0-9]{0,12}", params[0]):
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
        self.check_repo("probono")
        self.git(
            "probono", "fetch", "--quiet", "origin", "refs/heads/main:refs/remotes/origin/main"
        )
        return sha(
            self.git(
                "probono", "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"
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
        fmt = '[{"Id":{{json .Id}},"Image":{{json .Image}},"State":{"Status":{{json .State.Status}},"Health":{"Status":{{if (index .State "Health")}}{{json .State.Health.Status}}{{else}}null{{end}}}},"Mounts":{{json .Mounts}},"Config":{"Labels":{{json .Config.Labels}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}]'
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
            str(CODE / "backup-mirror.sh"),
            "/etc/systemd/system/policai-pull.service",
            *(str(USER_UNITS / f"probono-{name}.service") for name in WORKER_GUARDS),
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
            app = candidate / "apps/probono"
            check_compose_source(app, self.config["compose_sha256"])
            tag = "probono-radar-worker:candidate-" + record["id"]
            self.state.write("candidate-compose.json", overlay(tag))
            self.validate_compose(app, "candidate")
            self.compose(app, "candidate", "build", "worker", timeout=1200)
            record["images"] = {
                "worker": image_id(
                    self.docker("image", "inspect", "--format", "{{.Id}}", tag).strip()
                )
            }
            self.checkpoint(lane + ":built")
        # No fast-forward or activation has occurred before this barrier.

    def validate_compose(self, app, selection):
        check_compose_source(app, self.config["compose_sha256"])
        cfg = json.loads(self.compose(app, selection, "config", "--format", "json"))
        if cfg.get("name") != "probono-radar" or set(cfg["services"]) != {"db", "worker"}:
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
        ports = cfg["services"]["db"].get("ports", [])
        if (
            len(ports) != 1
            or ports[0].get("host_ip") != "127.0.0.1"
            or str(ports[0].get("published")) != "5433"
            or int(ports[0].get("target", 0)) != 5432
        ):
            raise Refused("non-loopback or changed port mapping")
        worker = cfg["services"]["worker"]
        if (
            worker.get("privileged")
            or worker.get("cap_add")
            or worker.get("devices")
            or worker.get("volumes")
        ):
            raise Refused("unapproved application container access")
        if Path(worker["build"]["context"]).resolve() != (app / "worker").resolve():
            raise Refused("build context escaped child application")
        if worker.get("network_mode") != "host":
            raise Refused("worker networking changed")

    def activate(self, record, lanes):
        for lane in BASES:
            if self.check_repo(lane) != record["previous"][lane]:
                raise Refused("release changed during build")
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
        # Written on every activation, so the overlay never lags active.json.
        self.state.write(
            "active-compose.json", overlay(self.active_record(record)["images"]["worker"])
        )
        self.checkpoint("activated")

    def active_record(self, record):
        return {
            "heads": {lane: record["target"] for lane in BASES},
            "images": record.get("images", record["before"]["images"]),
            "target": record["target"],
        }

    def health_snapshot(self, active):
        self.verify_database()
        self.docker(
            "image",
            "inspect",
            "--format",
            "{{.Id}}",
            image_id(active["images"]["worker"]),
        )
        # Socket binding is independent proof; the container port map is not a listener.
        sockets = self.runner.execute(["/usr/bin/ss", "-H", "-ltn"], "/")
        addresses = [
            line.split()[3]
            for line in sockets.splitlines()
            if len(line.split()) >= 4 and line.split()[3].endswith(":5433")
        ]
        if addresses != ["127.0.0.1:5433"]:
            raise Refused("database listener boundary mismatch")

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
        self.state.write("active-compose.json", overlay(record["before"]["images"]["worker"]))

    def restored_health(self, record):
        for lane in BASES:
            if self.check_repo(lane) != record["before"]["heads"][lane]:
                raise Refused("restored source identity mismatch")
        self.health_snapshot(record["before"])

    def check_worker_identity(self):
        if os.geteuid() != pwd.getpwnam("l0cka").pw_uid:
            raise Refused("scheduled workers must execute as l0cka")

    def check_worker_release(self):
        active = parse_active(self.state.require_ready())
        if active.get("bootstrap_pending"):
            raise Refused("initial activation incomplete")
        if self.check_repo("probono") != active["heads"]["probono"]:
            raise Refused("worker source differs from active release")
        if self.state.read("active-compose.json") != overlay(active["images"]["worker"]):
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

    def check_worker_database(self):
        self.verify_database()
        self.validate_compose(BASES["probono"] / "app/apps/probono", "active")

    def check_worker(self, guard):
        self.check_worker_identity()
        if guard == "release":
            self.check_worker_release()
        elif guard == "database":
            self.check_worker_database()
        elif guard != "mirror":
            raise Refused("unknown worker guard")

    def run_worker(self, name, lockfds):
        if name == "neon-sync":
            return self.neon_sync(lockfds)
        if name not in WORKER_SCRIPTS:
            raise Refused("scheduled command out of scope")
        self.check_worker(WORKER_GUARDS[name])
        extra_env = {
            "PATH": str(CODE / "bin") + ":/home/l0cka/.local/bin:/usr/bin:/bin",
            "PROBONO_DOCKER_BIN": str(CODE / "bin/docker"),
            "PROBONO_CLAUDE_BIN": "/home/l0cka/.local/bin/claude",
        }
        if name == "backup-mirror":
            extra_env.update(mirror_environment(self.config))
        with worker_task(name):
            self.runner.execute(
                ["/usr/bin/bash", WORKER_SCRIPTS[name]],
                BASES["probono"] / "app/apps/probono",
                identity="l0cka",
                timeout=1800,
                limit=16_000_000,
                pass_fds=lockfds,
                extra_env=extra_env,
            )
        # Do not return or journal worker output, which can contain article data.

    def neon_sync(self, lockfds):
        self.check_worker(WORKER_GUARDS["neon-sync"])
        envstat = secure_path(NEON_ENV_FILE)
        if envstat.st_mode & 0o007 or envstat.st_size > 4096:
            raise Refused("Neon environment file unsafe")
        neon = neon_environment(NEON_ENV_FILE.read_text())
        password = neon.pop("NEON_PASSWORD")
        app = BASES["probono"] / "app/apps/probono"
        with worker_task("neon-sync"):
            return self.runner.execute(
                [
                    *self.compose_argv(app, "active"),
                    "exec",
                    "-T",
                    *(item for name in neon for item in ("-e", name)),
                    "db",
                    "sh",
                    "-c",
                    NEON_SYNC_SCRIPT,
                ],
                app,
                identity="l0cka",
                timeout=600,
                limit=4096,
                pass_fds=lockfds,
                extra_env=neon,
                stdin_data=password.encode() + b"\n",
            ).strip()

    def worker_compose(self, args, lockfds, stdin_data=None):
        allowed = worker_arguments(args)
        backup = allowed[0] == "exec"
        self.check_worker(compose_guard(args))

        if stdin_data is not None and not any(saver in allowed for saver in STDIN_TASKS):
            raise Refused("unexpected worker stdin")
        app = BASES["probono"] / "app/apps/probono"
        with worker_task(allowed[3] if backup else allowed[7]):
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
def worker_guard(
    state,
    guard="release",
    serialize=True,
    wait=WORKER_LOCK_WAIT_SECONDS,
    clock=time.monotonic,
    sleep=time.sleep,
):
    with state.lock(exclusive=False, wait=wait, clock=clock, sleep=sleep) as fd:
        if guard == "release" and state.require_ready().get("bootstrap_pending"):
            raise Refused("initial activation incomplete")
        if not serialize:
            yield (fd,)
            return
        with state.lock(exclusive=True, worker=True) as workfd:
            yield (fd, workfd)


class Runner:
    def identity_argv(self, identity, argv, extra_env=None):
        if identity != "l0cka":
            raise Refused("unapproved command identity")
        clean = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": "/home/l0cka",
            "LANG": "C.UTF-8",
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
        account = pwd.getpwnam(identity)
        if os.geteuid() == account.pw_uid:
            return command
        return [
            SETPRIV,
            f"--reuid={account.pw_uid}",
            f"--regid={account.pw_gid}",
            "--init-groups",
            "--",
            *command,
        ]

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
        umask = -1
        if identity is not None:
            argv = self.identity_argv(identity, argv, extra_env)
            if argv[0] == SETPRIV:
                umask = LOGIN_UMASK
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
                umask=umask,
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
                raise Refused(f"command exited with status {result}")
            return output.decode("utf-8", errors="strict")
        except Refused as error:
            raise ProcessFailed(str(error)) from None
        except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
            failure = Refused if process is None else ProcessFailed
            raise failure("command unavailable or timed out") from None
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
