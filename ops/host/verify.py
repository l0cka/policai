#!/usr/bin/env python3
"""Offline checks only. Writes evidence inside this artifact directory."""

import ast
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

base = Path(__file__).resolve().parent
logs = base / "logs"
logs.mkdir(exist_ok=True)
(base / ".tmp").mkdir(exist_ok=True)
env = dict(os.environ, TMPDIR=str(base / ".tmp"), PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(base))
results = []
for name, directory in (("host", "tests"), ("compatibility", "compatibility")):
    command = [sys.executable, "-B", "-m", "unittest", "discover", "-s", directory, "-v"]
    run = subprocess.run(
        command, cwd=base, env=env, capture_output=True, text=True, timeout=120, check=False
    )
    output = run.stdout + run.stderr
    count = re.search(r"Ran (\d+) tests?", output)
    results.append(
        {
            "suite": name,
            "exit_code": run.returncode,
            "count": int(count[1]) if count else None,
            "output": output,
        }
    )
    print(output)

sources = [
    base / name
    for name in (
        "cli.py",
        "host.py",
        "dispatcher.py",
        "install.py",
        "run_tests.py",
        "verify.py",
        "bin/docker",
        "compatibility/policai-deploy.sh",
    )
]
sources += sorted((base / "tests").glob("*.py")) + sorted(
    (base / "compatibility").glob("test_*.py")
)
for source in sources:
    ast.parse(source.read_text(), filename=str(source))
for shell in ("backup.sh", "policai-deploy"):
    subprocess.run(["/usr/bin/bash", "-n", str(base / shell)], check=True, capture_output=True)

checks = [
    "cli.py",
    "host.py",
    "dispatcher.py",
    "install.py",
    "bin/docker",
    "backup.sh",
    "policai-deploy",
    "compatibility/policai-deploy.sh",
    "compatibility/test_compat.py",
    "README.txt",
    "INSTALL-REVIEW.txt",
    "SANDBOX-REVIEW.md",
    "config.example.json",
    "baseline.example.json",
    "units/policai-pull.service",
    "units/probono-ingest.service",
    "units/probono-enrich.service",
    "units/probono-backup.service",
    "ruff.toml",
    "run_tests.py",
    "verify.py",
]
checks += ["tests/" + path.name for path in sorted((base / "tests").glob("*.py"))]
manifest = {name: hashlib.sha256((base / name).read_bytes()).hexdigest() for name in checks}
passed = all(item["exit_code"] == 0 and item["count"] is not None for item in results)
report = {
    "passed": passed,
    "total_tests": sum(item["count"] or 0 for item in results),
    "suites": results,
    "syntax_files": len(sources),
    "shell_syntax_files": 2,
    "production_mutations": False,
    "live_deployment_verified": False,
    "independent_review": "pending Bob review",
    "artifact_sha256": manifest,
}
(logs / "FINAL-VERIFICATION.json").write_text(json.dumps(report, indent=2) + "\n")
(base / "MANIFEST.sha256").write_text(
    "".join(digest + "  " + name + "\n" for name, digest in sorted(manifest.items()))
)
print(
    json.dumps(
        {
            key: report[key]
            for key in (
                "passed",
                "total_tests",
                "syntax_files",
                "shell_syntax_files",
                "live_deployment_verified",
            )
        }
    )
)
raise SystemExit(0 if passed else 1)
