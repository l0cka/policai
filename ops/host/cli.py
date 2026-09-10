#!/usr/bin/python3 -I
"""Installed entrypoint. --help is safe from the uninstalled review bundle."""

import argparse
import json
import os
import re
import stat
import sys
from pathlib import Path


def parser():
    p = argparse.ArgumentParser(
        description="Two independent runtime deploy/worker dispatcher (approval-gated)."
    )
    commands = p.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "initialize",
        help="validate approved running baseline; workers stay blocked until first activation",
    )
    deploy = commands.add_parser(
        "deploy",
        help="deploy the root-config approved target; fail closed on any mismatch",
    )
    deploy.add_argument("--initial", action="store_true", help="force both initial builds")
    deploy.add_argument(
        "--recover",
        metavar="TRANSACTION_ID",
        help="reviewed redeployment after verified rollback",
    )
    commands.add_parser("rollback", help="restore journaled artifacts; KEEP failure gate")
    commands.add_parser(
        "status", help="show nonsecret transaction metadata, not a health assertion"
    )
    worker = commands.add_parser(
        "worker", help="run exactly one guarded scheduled operation as l0cka"
    )
    worker.add_argument("operation", choices=("ingest", "enrich", "backup"))
    compose = commands.add_parser(
        "compose", help="internal allowlisted worker adapter; never arbitrary docker"
    )
    compose.add_argument("arguments", nargs=argparse.REMAINDER)
    return p


def validate_remote(value):
    # One public read-only origin. No SSH key, credential helper or URL token.
    expected = "https://github.com/l0cka/policai.git"
    if value != expected:
        raise RuntimeError("expected exact public Policai HTTPS origin")
    return value


def trusted_entrypoint():
    here = Path(__file__)
    expected = Path("/usr/local/libexec/policai-host/cli.py")
    if here != expected or here.resolve() != expected:
        raise RuntimeError(
            "use installed root-owned entrypoint; uninstalled artifacts cannot operate on production"
        )
    for path in [here, *here.parents]:
        item = path.lstat()
        if item.st_uid != 0 or item.st_mode & 0o022 or stat.S_ISLNK(item.st_mode):
            raise RuntimeError("unsafe installed root-owned entrypoint")
    for name in ("dispatcher.py", "host.py"):
        item = (here.parent / name).lstat()
        if (
            item.st_uid != 0
            or item.st_mode & 0o022
            or not stat.S_ISREG(item.st_mode)
            or item.st_nlink != 1
        ):
            raise RuntimeError("unsafe installed adapter")
    sys.path.insert(0, str(here.parent))


def main():
    args = parser().parse_args()
    try:
        trusted_entrypoint()
        import host as h
        from dispatcher import Refused, State, Transaction, secure_path, sha

        if args.command in ("initialize", "deploy", "rollback") and os.geteuid() != 0:
            raise Refused("deployment authority requires root")
        state = State(h.STATE)
        if args.command == "status":
            with state.lock(exclusive=False):
                blocked = os.path.lexists(h.STATE / "blocked.json")
                record = state.read("blocked.json" if blocked else "active.json")
                print(
                    json.dumps(
                        {
                            "blocked": blocked,
                            "phase": record.get("phase"),
                            "transaction": record.get("id"),
                            "target": record.get("target"),
                            "bootstrap_pending": record.get("bootstrap_pending", False),
                        }
                    )
                )
            return 0
        secure_path(h.CONFIG)
        if h.CONFIG.stat().st_size > 65536:
            raise Refused("config oversized")
        config = json.loads(h.CONFIG.read_text())
        sha(config["approved_target"])
        validate_remote(config["remote"])
        if not re.fullmatch("[0-9a-f]{64}", config["compose_sha256"]):
            raise Refused("Compose approval missing")
        if (
            not isinstance(config["min_free_bytes"], int)
            or config["min_free_bytes"] < 2_000_000_000
        ):
            raise Refused("disk reserve must be at least 2GB")
        if not re.fullmatch("[0-9a-f]{64}", config["db"]["id"]):
            raise Refused("full DB identity required")
        h.image_id(config["db"]["image"])
        if not re.fullmatch("[0-9]+", config["db"]["cluster"]):
            raise Refused("DB cluster identity required")
        host = h.Host(config, state)
        tx = Transaction(state, host)
        if args.command == "initialize":
            import uuid

            baseline_path = Path("/etc/policai-deploy/baseline.json")
            secure_path(baseline_path)
            if baseline_path.stat().st_size > 65536:
                raise Refused("baseline oversized")
            baseline = json.loads(baseline_path.read_text())
            for lane in h.BASES:
                sha(baseline["heads"][lane])
            for image in baseline["images"].values():
                h.image_id(image)
            baseline["bootstrap_pending"] = True
            with state.lock(exclusive=True):
                if any(
                    os.path.lexists(h.STATE / name)
                    for name in ("active.json", "blocked.json", "last-success.json")
                ):
                    raise Refused("initialization is one-shot; preserve existing state")
                state.write(
                    "blocked.json",
                    {
                        "id": uuid.uuid4().hex,
                        "phase": "initialization",
                        "before": baseline,
                        "lanes": [],
                        "target": config["approved_target"],
                    },
                )
                host.preflight(baseline)
                state.write(
                    "active-compose.json",
                    h.overlay(baseline["images"]["dashboard"], baseline["images"]["worker"]),
                )
                state.write("active.json", baseline)
                state.clear_marker()
            print("baseline verified; initial two-runtime activation REQUIRED")
        elif args.command == "deploy":
            if args.recover and config.get("recovery_authorization") != args.recover:
                raise Refused("exact recovery transaction not approved in root config")
            lanes = tx.deploy(
                None
                if config.get("follow_main") is True and not args.initial and not args.recover
                else config["approved_target"],
                initial=args.initial,
                recovery=args.recover,
            )
            print(json.dumps({"verified": True, "activated_lanes": sorted(lanes)}))
        elif args.command == "rollback":
            tx.rollback()
            print("rollback health verified; persistent gate remains")
        elif args.command == "worker":
            with h.worker_guard(state) as fds:
                host.run_worker(args.operation, fds)
            print("scheduled operation completed")
        elif args.command == "compose":
            command = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
            h.worker_arguments(command)
            payload = None
            if "src/save-enrichment.ts" in command:
                payload = sys.stdin.buffer.read(262145)
                if len(payload) > 262144:
                    raise Refused("worker input exceeds bound")
            with h.worker_guard(state, serialize=False) as fds:
                output = host.worker_compose(command, fds, payload)
            sys.stdout.write(output)
        return 0
    except (RuntimeError, OSError, ValueError, KeyError, TypeError):
        # Never print arbitrary command output, exception details, config or env.
        if Path(__file__).resolve() != Path("/usr/local/libexec/policai-host/cli.py"):
            print(
                "Refused: use installed root-owned entrypoint; this artifact is uninstalled.",
                file=sys.stderr,
            )
        else:
            print(
                "Refused: guarded operation failed. Inspect status and reviewed prerequisites; no automatic retry.",
                file=sys.stderr,
            )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
