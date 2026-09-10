#!/usr/bin/env python3
"""First-install file transaction. Never provisions secrets or activates a runtime.

Only plan runs from a source checkout. See INSTALL-REVIEW.txt for protected
snapshot provisioning, prerequisites and the separate application cutover.
"""

import argparse
import fcntl
import hashlib
import json
import os
import pwd
import re
import stat
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path

REVIEW = Path("/usr/local/libexec/policai-host-review")
STATE = Path("/var/lib/policai-deploy-state")
JOURNAL = STATE / "installation"
USER_UNITS = Path("/home/l0cka/.config/systemd/user")
FILES = {
    **{
        name: (
            f"/usr/local/libexec/policai-host/{name}",
            0o755 if name in {"bin/docker", "backup.sh"} else 0o644,
            "root",
        )
        for name in ("cli.py", "host.py", "dispatcher.py", "bin/docker", "backup.sh")
    },
    "policai-deploy": ("/usr/local/libexec/policai-deploy", 0o755, "root"),
    "compatibility/policai-deploy.sh": ("/home/l0cka/.local/bin/policai-deploy.sh", 0o755, "l0cka"),
    "units/policai-pull.service": ("/etc/systemd/system/policai-pull.service", 0o644, "root"),
    **{
        f"units/probono-{name}.service": (
            str(USER_UNITS / f"probono-{name}.service"),
            0o644,
            "l0cka",
        )
        for name in ("ingest", "enrich", "backup")
    },
}


class Refused(RuntimeError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def protected(path, owner=0, directory=False):
    """Reject aliases, hardlinks and writable authority paths before reading."""
    if not path.is_absolute() or path.resolve() != path:
        raise Refused("path alias")
    info = path.lstat()
    valid_type = stat.S_ISDIR if directory else stat.S_ISREG
    if not valid_type(info.st_mode) or info.st_uid != owner or info.st_mode & 0o022:
        raise Refused("unsafe owner, type or mode")
    if not directory and info.st_nlink != 1:
        raise Refused("hardlinked file")
    for parent in path.parents:
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in {0, owner} or info.st_mode & 0o022:
            raise Refused("unsafe ancestor")


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextmanager
def parent_fd(path):
    # Open every component without following links, then retain the directory
    # descriptor through reads/renames. A swapped parent cannot redirect a write.
    if not path.is_absolute() or any(part in {".", ".."} for part in path.parts):
        raise Refused("invalid absolute path")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        yield fd
    finally:
        os.close(fd)


def read_regular(path, owner=None):
    with parent_fd(path) as directory:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 1_000_000:
                raise Refused("unsupported file")
            if owner is not None and info.st_uid != owner:
                raise Refused("file owner changed")
            data = stream.read(1_000_001)
            if len(data) > 1_000_000:
                raise Refused("file grew beyond bound")
            return info, data


def atomic_write(path, data, mode, uid, gid):
    with parent_fd(path) as directory:
        if os.fstat(directory).st_uid != uid:
            raise Refused("destination directory owner changed")
        temporary = ".install-" + uuid.uuid4().hex
        fd = os.open(
            temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory
        )
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fchown(stream.fileno(), uid, gid)
                os.fchmod(stream.fileno(), mode)
                os.fsync(stream.fileno())
            os.replace(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory)
            os.fsync(directory)
        finally:
            try:
                os.unlink(temporary, dir_fd=directory)
            except FileNotFoundError:
                pass


def snapshot(path):
    try:
        info, data = read_regular(path)
    except FileNotFoundError:
        return None
    except OSError:
        raise Refused("destination is not a readable regular file") from None
    return {
        "sha256": digest(data),
        "mode": stat.S_IMODE(info.st_mode),
        "uid": info.st_uid,
        "gid": info.st_gid,
    }


class FileTransaction:
    """Internal API: tests supply temporary paths; the CLI only uses fixed paths."""

    def __init__(self, source, journal, entries, check=protected):
        self.source, self.journal, self.entries, self.check = source, journal, entries, check
        self.checkpoint = lambda phase: None

    def save(self, record):
        atomic_write(
            self.journal / "journal.json",
            (json.dumps(record, sort_keys=True) + "\n").encode(),
            0o600,
            os.geteuid(),
            os.getegid(),
        )

    def apply(self):
        if os.path.lexists(self.journal):
            raise Refused("installation already recorded; preserve or roll back the journal")
        # Validate every input before the first destination changes.
        items, payloads = [], []
        for name, path, mode, uid, gid in self.entries:
            self.check(path.parent, uid, directory=True)
            self.check(self.source / name)
            before = snapshot(path)
            if before is not None:
                self.check(path, uid)
            data = (self.source / name).read_bytes()
            after = {"sha256": digest(data), "mode": mode, "uid": uid, "gid": gid}
            items.append({"source": name, "before": before, "after": after})
            payloads.append(data)
        self.journal.mkdir(mode=0o700)
        sync(self.journal.parent)
        record = {"phase": "preparing", "files": items}
        self.save(record)
        self.checkpoint("preparing")
        # Back up ALL original bytes before replacing ANY destination.
        for index, (_, path, _, _, _) in enumerate(self.entries):
            if snapshot(path) != items[index]["before"]:
                raise Refused("destination changed during preparation")
            if items[index]["before"] is not None:
                _, data = read_regular(path, items[index]["before"]["uid"])
                if digest(data) != items[index]["before"]["sha256"]:
                    raise Refused("destination changed during backup")
                atomic_write(
                    self.journal / f"{index}.before", data, 0o600, os.geteuid(), os.getegid()
                )
        record["phase"] = "prepared"
        self.save(record)
        self.checkpoint("prepared")
        for index, (_, path, mode, uid, gid) in enumerate(self.entries):
            if snapshot(path) != items[index]["before"]:
                raise Refused("destination changed before replacement")
            atomic_write(path, payloads[index], mode, uid, gid)
            self.checkpoint(f"replaced:{index}")
        for index, (_, path, _, uid, _) in enumerate(self.entries):
            self.check(path, uid)
            if snapshot(path) != items[index]["after"]:
                raise Refused("installed file differs")
        record["phase"] = "installed"
        self.save(record)

    def rollback(self):
        self.check(self.journal, directory=True)
        self.check(self.journal / "journal.json")
        if (self.journal / "journal.json").stat().st_size > 65536:
            raise Refused("installation journal oversized")
        record = json.loads((self.journal / "journal.json").read_text())
        if record.get("phase") not in {"preparing", "prepared", "installed", "rolled-back"}:
            raise Refused("unknown installation phase")
        if len(record.get("files", [])) != len(self.entries):
            raise Refused("installation file set changed")
        if record["phase"] in {"preparing", "rolled-back"}:
            for (name, path, _, _, _), item in zip(self.entries, record["files"], strict=True):
                if item["source"] != name or snapshot(path) != item["before"]:
                    raise Refused("destination changed during incomplete preparation")
            record["phase"] = "rolled-back"
            self.save(record)
            return
        # Validate ALL current files and backups before restoring any file.
        backups = []
        for index, ((name, path, mode, uid, gid), item) in enumerate(
            zip(self.entries, record["files"], strict=True)
        ):
            self.check(path.parent, uid, directory=True)
            if item["source"] != name or any(
                item["after"][key] != value
                for key, value in (("mode", mode), ("uid", uid), ("gid", gid))
            ):
                raise Refused("installation contract changed")
            if snapshot(path) not in (item["before"], item["after"]):
                raise Refused("destination changed since installation")
            data = None
            if item["before"] is not None:
                backup = self.journal / f"{index}.before"
                self.check(backup)
                data = backup.read_bytes()
                if digest(data) != item["before"]["sha256"]:
                    raise Refused("rollback backup changed")
            backups.append(data)
        for index in reversed(range(len(self.entries))):
            _, path, _, uid, _ = self.entries[index]
            item = record["files"][index]
            current = snapshot(path)
            if current == item["before"]:
                continue
            if current != item["after"]:
                raise Refused("destination changed during rollback")
            self.check(path, uid)
            if item["before"] is None:
                with parent_fd(path) as directory:
                    if os.fstat(directory).st_uid != uid:
                        raise Refused("destination directory owner changed")
                    os.unlink(path.name, dir_fd=directory)
                    os.fsync(directory)
            else:
                before = item["before"]
                atomic_write(path, backups[index], before["mode"], before["uid"], before["gid"])
            self.checkpoint(f"restored:{index}")
        record["phase"] = "rolled-back"
        self.save(record)


def command(argv, user=False):
    if user:
        account = pwd.getpwnam("l0cka")
        argv = [
            "/usr/bin/runuser",
            "-u",
            "l0cka",
            "--",
            "/usr/bin/env",
            "-i",
            "PATH=/usr/bin:/bin",
            "HOME=/home/l0cka",
            f"XDG_RUNTIME_DIR=/run/user/{account.pw_uid}",
            *argv,
        ]
    result = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=30,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        check=False,
    )
    if result.returncode:
        raise Refused("preflight command failed")
    return result.stdout.strip()


def held():
    for user, names in (
        (False, ("policai-pull",)),
        (True, ("probono-ingest", "probono-enrich", "probono-backup", "probono-digest")),
    ):
        for name in names:
            for suffix in (".service", ".timer"):
                args = [
                    "/usr/bin/systemctl",
                    *(["--user"] if user else []),
                    "show",
                    name + suffix,
                    "--property=LoadState,ActiveState,SubState,DropInPaths,UnitFileState",
                ]
                state = dict(line.split("=", 1) for line in command(args, user).splitlines())
                masked = name == "probono-digest"
                if (
                    state.get("ActiveState") != "inactive"
                    or state.get("SubState") != "dead"
                    or state.get("DropInPaths") != ""
                    or state.get("LoadState") != ("masked" if masked else "loaded")
                ):
                    raise Refused("timers/jobs must be held with reviewed effective units")
                if masked and state.get("UnitFileState") != "masked":
                    raise Refused("digest mask missing")
    for suffix in (".service", ".timer"):
        mask = USER_UNITS / ("probono-digest" + suffix)
        if not mask.is_symlink() or os.readlink(mask) != "/dev/null":
            raise Refused("digest mask file changed")
    if command(
        [
            "/usr/bin/docker",
            "ps",
            "--filter",
            "label=com.docker.compose.project=probono-radar",
            "--filter",
            "label=com.docker.compose.service=worker",
            "--format",
            "{{.ID}}",
        ],
        user=True,
    ):
        raise Refused("legacy worker container active")
    # Include manual legacy shells, which do not participate in dispatcher locks.
    processes = command(["/usr/bin/ps", "-eo", "args="])
    if re.search(
        r"(?:^|\s)(?:[^\s]*/)?ops/(?:ingest|enrich)\.sh(?:\s|$)|probono-radar/ops-host/backup-db\.sh",
        processes,
    ):
        raise Refused("legacy worker process active")


def verify_manifest(expected):
    path = REVIEW / "MANIFEST.sha256"
    protected(path)
    data = path.read_bytes()
    if not re.fullmatch("[0-9a-f]{64}", expected) or digest(data) != expected:
        raise Refused("reviewed manifest digest differs")
    hashes = {}
    for line in data.decode().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_./-]+)", line)
        if (
            not match
            or match[2] in hashes
            or any(p in {"", ".", ".."} for p in match[2].split("/"))
        ):
            raise Refused("invalid manifest")
        name = match[2]
        protected(REVIEW / name)
        if digest((REVIEW / name).read_bytes()) != match[1]:
            raise Refused("reviewed source changed")
        hashes[name] = match[1]
    if not (set(FILES) | {"install.py"}).issubset(hashes):
        raise Refused("incomplete reviewed snapshot")
    return hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("plan", "apply", "rollback"))
    parser.add_argument("--manifest-sha256")
    args = parser.parse_args()
    if args.operation == "plan":
        print(
            json.dumps(
                {
                    "files": [
                        {"source": name, "destination": path, "mode": oct(mode), "owner": owner}
                        for name, (path, mode, owner) in FILES.items()
                    ],
                    "journal": str(JOURNAL),
                    "activates_runtimes": False,
                    "changes_timers": False,
                },
                indent=2,
            )
        )
        return 0
    try:
        if Path(__file__) != REVIEW / "install.py" or os.geteuid() != 0:
            raise Refused("use protected review snapshot as root")
        protected(Path(__file__))
        verify_manifest(args.manifest_sha256 or "")
        protected(STATE, directory=True)
        protected(STATE / "deploy.lock")
        lock = os.open(STATE / "deploy.lock", os.O_RDONLY | os.O_NOFOLLOW)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if os.fstat(lock).st_ino != (STATE / "deploy.lock").stat().st_ino:
                raise Refused("deployment lock changed")
            held()
            if any(
                os.path.lexists(STATE / name)
                for name in ("active.json", "blocked.json", "last-success.json", "recovery.json")
            ):
                raise Refused("dispatcher already initialised; installation rollback forbidden")
            entries = []
            for name, (path, mode, owner) in FILES.items():
                account = pwd.getpwnam(owner)
                entries.append((name, Path(path), mode, account.pw_uid, account.pw_gid))
            transaction = FileTransaction(REVIEW, JOURNAL, entries)
            getattr(transaction, args.operation)()
        finally:
            os.close(lock)
        print("Installation files verified; timers remain held. No runtime activation performed.")
        return 0
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(
            "Refused: preserve installation journal and held timers; inspect reviewed prerequisites.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
