#!/usr/bin/env bash
# One enrichment pass: the agent reads the next batch of unenriched items,
# classifies them and writes back judgements.
#
# This runs on its own timer as well as at the tail of each daily ingest. The
# agent takes 40 items per pass (worker/src/list-unenriched.ts), which one daily
# run could not keep up with once the source list grew to 143 — six passes a day
# clears roughly 240, comfortably ahead of what the feeds produce.
set -euo pipefail
cd "$(dirname "$0")/.."

# Two passes on the same queue would each be handed the same 40 rows and would
# duplicate one another's work, so only one runs at a time. A pass that arrives
# while another is working skips rather than waits: the next tick is 4 hours
# away and the queue is not going anywhere.
exec 9>/tmp/probono-enrich.lock
if ! flock -n 9; then
  echo "[enrich] another pass holds the lock, skipping $(date -Is)"
  exit 0
fi

echo "[enrich] starting $(date -Is)"

# Haiku keeps enrichment on the subscription while consuming far less of its
# usage allowance than the default model; the runbook and guardrails are
# model-agnostic.
/home/l0cka/.local/bin/claude -p "$(cat RUNBOOK.md)" \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Bash(docker compose --profile worker run --rm worker src/list-unenriched.ts),Bash(docker compose --profile worker run --rm -T worker src/save-enrichment.ts:*),Bash(echo:*),WebFetch" \
  --max-turns 80 \
  --output-format text

echo "[enrich] done $(date -Is)"
