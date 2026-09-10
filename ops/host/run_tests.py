#!/usr/bin/env python3
"""Run tests offline, preserving real output and exit code per TDD step."""

import json
import os
import subprocess
import sys
from pathlib import Path

base = Path(__file__).resolve().parent
(base / "logs").mkdir(exist_ok=True)
(base / ".tmp").mkdir(exist_ok=True)
label = sys.argv[1]
env = dict(
    os.environ,
    TMPDIR=str(base / ".tmp"),
    PYTHONDONTWRITEBYTECODE="1",
    PYTHONPATH=str(base),
)
command = [sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-v"]
result = subprocess.run(
    command,
    cwd=base,
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)
log = {
    "label": label,
    "command": command,
    "exit_code": result.returncode,
    "output": result.stdout,
}
(base / "logs" / (label + ".json")).write_text(json.dumps(log, indent=2) + "\n")
print(result.stdout)
print("EXIT_CODE=" + str(result.returncode))
sys.exit(result.returncode)
