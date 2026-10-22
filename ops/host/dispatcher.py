#!/usr/bin/env python3
"""Two-runtime deployment transaction. Uninstalled; see host.py for fixed adapters."""

import contextlib
import fcntl
import json
import os
import re
import stat
import time
import uuid
from pathlib import Path

LOCK_POLL_SECONDS = 0.5
# Consecutive pre-staging failures a follow_main run retries before it blocks.
DEFER_LIMIT = 5
LOCK_BUSY = {
    ("deploy.lock", True): "another deployment or worker is running",
    ("deploy.lock", False): "deploy.lock busy: a deployment holds it",
    ("worker.lock", True): "worker.lock busy: another scheduled worker is running",
}


class Refused(RuntimeError):
    """Public, nonsecret operational error."""


def secure_path(path, owner=0, directory=False, ancestors=True):
    """Reject aliases and writable authority paths. Never reads file content."""
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path:
        raise Refused("unsafe path alias")
    try:
        s = path.lstat()
        expected = stat.S_ISDIR if directory else stat.S_ISREG
        if not expected(s.st_mode) or s.st_uid != owner or s.st_mode & 0o022:
            raise Refused("unsafe path ownership or mode")
        if not directory and s.st_nlink != 1:
            raise Refused("hardlinked authority file")
        if ancestors:
            for parent in path.parents:
                ps = parent.lstat()
                if (
                    not stat.S_ISDIR(ps.st_mode)
                    or ps.st_uid not in (0, owner)
                    or ps.st_mode & 0o022
                ):
                    raise Refused("unsafe ancestor")
        return s
    except OSError:
        raise Refused("required protected path unavailable") from None


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class State:
    NAMES = {
        "blocked.json",
        "deferred.json",
        "active.json",
        "last-success.json",
        "recovery.json",
        "active-compose.json",
        "candidate-compose.json",
    }

    def __init__(self, root, owner=0):
        self.root, self.owner = Path(root), owner
        secure_path(self.root, owner, directory=True)

    def read(self, name):
        if name not in self.NAMES:
            raise Refused("unknown state record")
        path = self.root / name
        secure_path(path, self.owner)
        try:
            if path.stat().st_size > 65536:
                raise ValueError()
            value = json.loads(path.read_text())
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (OSError, ValueError):
            raise Refused("invalid persistent state") from None

    def write(self, name, record):
        if name not in self.NAMES or os.geteuid() != self.owner:
            raise Refused("state write not authorized")
        secure_path(self.root, self.owner, directory=True)
        path = self.root / name
        if os.path.lexists(path):
            secure_path(path, self.owner)
        temporary = self.root / (".write-" + uuid.uuid4().hex)
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(record, stream, sort_keys=True)
                stream.flush()
                os.fchmod(stream.fileno(), 0o644)
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            sync_dir(self.root)
        finally:
            temporary.unlink(missing_ok=True)

    def archive_block(self, record):
        identifier = record.get("id", "")
        if not re.fullmatch("[0-9a-f]{32}", identifier):
            raise Refused("invalid recovery identity")
        directory = self.root / "history"
        directory.mkdir(mode=0o755, exist_ok=True)
        secure_path(directory, self.owner, directory=True)
        path = directory / (identifier + ".json")
        if os.path.lexists(path):
            secure_path(path, self.owner)
            if json.loads(path.read_text()) != record:
                raise Refused("recovery history collision")
            return
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        with os.fdopen(fd, "w") as stream:
            json.dump(record, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        sync_dir(directory)
        sync_dir(self.root)

    def clear_marker(self, name="blocked.json"):
        if name not in self.NAMES:
            raise Refused("unknown state record")
        secure_path(self.root / name, self.owner)
        (self.root / name).unlink()
        sync_dir(self.root)

    def require_ready(self):
        if os.path.lexists(self.root / "blocked.json"):
            raise Refused("persistent block: reviewed recovery required")
        return self.read("active.json")

    @contextlib.contextmanager
    def lock(self, exclusive, worker=False, wait=0, clock=time.monotonic, sleep=time.sleep):
        path = self.root / ("worker.lock" if worker else "deploy.lock")
        before = secure_path(path, self.owner)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        except OSError:
            raise Refused("lock unavailable") from None
        try:
            opened = os.fstat(fd)
            if (opened.st_ino, opened.st_dev) != (before.st_ino, before.st_dev):
                raise Refused("lock inode changed")
            deadline = clock() + wait
            while True:
                try:
                    fcntl.flock(fd, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if clock() >= deadline:
                        raise Refused(LOCK_BUSY[path.name, exclusive]) from None
                    sleep(LOCK_POLL_SECONDS)
            yield fd
        finally:
            os.close(fd)


def sha(value):
    if not isinstance(value, str) or not re.fullmatch("[0-9a-f]{40}", value):
        raise Refused("full lowercase SHA-1 required")
    return value


def move(source, destination):
    # Same-filesystem rename only, never a recursive copy or delete.
    if source.is_symlink() or not source.is_dir() or os.path.lexists(destination):
        raise Refused("unsafe or occupied artifact swap path")
    os.rename(source, destination)
    sync_dir(source.parent)
    if source.parent != destination.parent:
        sync_dir(destination.parent)


def promote(candidate, active, old, checkpoint):
    if os.path.lexists(old):
        raise Refused("rollback artifact already exists")
    move(active, old)
    checkpoint("old-retained")
    move(candidate, active)
    checkpoint("candidate-active")


def undo_promote(candidate, active, old, failed):
    # Filesystem position is the journal for individual atomic renames. Safe to
    # repeat after interruption between either rollback rename.
    if old.exists():
        if active.exists():
            move(active, failed)
        move(old, active)
    elif not active.is_dir() or active.is_symlink():
        raise Refused("rollback artifact identity unknown")
    elif not candidate.exists() and not failed.exists():
        raise Refused("no evidence of unstarted or completed rollback")


class Transaction:
    def __init__(self, state, host):
        self.state, self.host = state, host

    def deploy(self, target, initial=False, recovery=None):
        if target is not None:
            sha(target)
        with self.state.lock(exclusive=True):
            if recovery is not None:
                prior = self.state.read("blocked.json")
                if recovery != prior["id"] or self.state.read("recovery.json") != {
                    "id": recovery,
                    "phase": "rolled-back-healthy",
                }:
                    raise Refused("reviewed healthy rollback required")
                active = self.state.read("active.json")
                self.state.archive_block(prior)
            else:
                active = self.state.require_ready()
            if active.get("bootstrap_pending") and not initial:
                raise Refused("first activation must build both runtimes")
            record = {
                "id": uuid.uuid4().hex,
                "target": target,
                "before": active,
                "phase": "preflight",
                "recovered_from": recovery,
            }
            self.state.write("blocked.json", record)

            def checkpoint(phase):
                record["phase"] = phase
                self.state.write("blocked.json", record)

            # Host progress hooks write only controlled metadata, never output.
            self.host.checkpoint = checkpoint
            resolved = target is None
            try:
                self.host.preflight(active)
                if resolved:
                    target = sha(self.host.resolve_target())
                    record["target"] = target
                    checkpoint("target-resolved")
                record.update(self.host.prepare(target))
                lanes = {"policai", "probono"} if initial else classify(record.pop("paths"))
                record["lanes"] = sorted(lanes)
                checkpoint("stage")
                self.host.stage(record, lanes)
                record["activation_started"] = True
                checkpoint("activate")
                self.host.activate(record, lanes)
                checkpoint("health")
                self.host.health(record)
                deployed = self.host.active_record(record)
                self.state.write("active.json", deployed)
                checkpoint("verified")
                self.state.write("last-success.json", record)
                if os.path.lexists(self.state.root / "deferred.json"):
                    self.state.clear_marker("deferred.json")
                self.state.clear_marker()
                return {
                    "verified": True,
                    "activated_lanes": record["lanes"],
                    "main": target,
                    "heads": deployed["heads"],
                }
            except BaseException as error:
                # Refused reasons are static and nonsecret; any other error keeps only its type.
                failure = {"phase": record["phase"], "error": type(error).__name__}
                if isinstance(error, Refused):
                    failure["reason"] = str(error)
                if resolved and record["phase"] in ("preflight", "target-resolved"):
                    # Nothing is staged and active.json is untouched (a network blip, a
                    # merge landing mid-run), so retry next cycle. Repeated failures still
                    # block. An explicit target (approved_target or --recover) always does.
                    deferred = (
                        self.state.read("deferred.json")
                        if os.path.lexists(self.state.root / "deferred.json")
                        else {"count": 0}
                    )
                    if deferred["count"] + 1 < DEFER_LIMIT:
                        self.state.write(
                            "deferred.json", {"count": deferred["count"] + 1, "failure": failure}
                        )
                        self.state.clear_marker()
                        raise Refused(
                            "deployment deferred before staging; next cycle retries"
                        ) from None
                record["failure"] = failure
                checkpoint("failed-review-required")
                raise Refused("deployment blocked; reviewed recovery required") from None

    def rollback(self):
        with self.state.lock(exclusive=True):
            record = self.state.read("blocked.json")
            self.host.checkpoint = lambda phase: self.state.write(
                "recovery.json", {"id": record["id"], "phase": phase}
            )
            self.host.rollback(record)
            self.host.restored_health(record)
            self.state.write("active.json", record["before"])
            self.state.write("recovery.json", {"id": record["id"], "phase": "rolled-back-healthy"})
            # Deliberately leave blocked.json. Resume needs independent review.


POLICAI, PROBONO = frozenset({"policai"}), frozenset({"probono"})
BOTH = POLICAI | PROBONO


def prefix(*prefixes):
    return lambda path: path.startswith(prefixes)


def named(*names):
    return lambda path: path in names


def is_test(path):
    return path.endswith((".test.ts", ".test.tsx")) or "__tests__" in path.split("/")[:-1]


def is_markdown(path):
    return path.endswith(".md") and "public" not in path.split("/")


ROUTES = (
    ("test", is_test, frozenset()),
    ("data", prefix("data/", "public/data/"), frozenset()),
    ("markdown", is_markdown, frozenset()),
    ("docs", prefix("docs/"), frozenset()),
    ("github", prefix(".github/"), frozenset()),
    ("ops", prefix("ops/host/", "ops/collector/"), frozenset()),
    ("scripts", prefix("scripts/"), frozenset()),
    ("probono", prefix("apps/probono/"), PROBONO),
    ("policai", prefix("src/", "public/", "mcp/", "design/"), POLICAI),
    (
        "policai-config",
        named(
            "next.config.ts",
            "next.config.js",
            "next.config.mjs",
            "postcss.config.mjs",
            "components.json",
            "package.json",
            "package-lock.json",
            "tsconfig.json",
        ),
        POLICAI,
    ),
)


def classify(paths):
    lanes = set()
    for path in paths:
        if (
            not isinstance(path, str)
            or "\0" in path
            or any(p in ("", ".", "..") for p in path.split("/"))
        ):
            raise ValueError("invalid repository-relative path")
        lanes.update(next((route for _, matches, route in ROUTES if matches(path)), BOTH))
    return lanes
