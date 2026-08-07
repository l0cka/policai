#!/usr/bin/env bash
# Daily ingest: deterministic fetch, then Claude Code enrichment run.
# Invoked by probono-ingest.service (systemd user timer) on Argus.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[ingest] fetch starting $(date -Is)"
docker compose --profile worker run --rm worker src/fetch-all.ts

echo "[ingest] enrichment agent starting $(date -Is)"
# Haiku keeps enrichment on the subscription while consuming far less of its
# usage allowance than the default model; the runbook and guardrails are
# model-agnostic.
/home/l0cka/.local/bin/claude -p "$(cat RUNBOOK.md)" \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Bash(docker compose --profile worker run --rm worker src/list-unenriched.ts),Bash(docker compose --profile worker run --rm -T worker src/save-enrichment.ts:*),Bash(echo:*),WebFetch" \
  --max-turns 80 \
  --output-format text

echo "[ingest] done $(date -Is)"
