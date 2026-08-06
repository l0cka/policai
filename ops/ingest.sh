#!/usr/bin/env bash
# Daily ingest: deterministic fetch, then Claude Code enrichment run.
# Invoked by probono-ingest.service (systemd user timer) on Argus.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[ingest] fetch starting $(date -Is)"
docker compose --profile worker run --rm worker src/fetch-all.ts

echo "[ingest] enrichment agent starting $(date -Is)"
/home/l0cka/.local/bin/claude -p "$(cat RUNBOOK.md)" \
  --allowedTools "Bash(docker compose --profile worker run --rm*) WebFetch" \
  --max-turns 80 \
  --output-format text

echo "[ingest] done $(date -Is)"
