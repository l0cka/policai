#!/usr/bin/env bash
# Daily ingest: deterministic fetch of every active source, then an enrichment
# pass over whatever that turned up.
#
# Fetch stays daily. Enrichment has its own timer (probono-enrich.timer) because
# it is the slower half — see ops/enrich.sh — but running it here too means a
# fetch is always followed by a pass rather than waiting for the next tick.
#
# Invoked by probono-ingest.service (systemd user timer) on Argus.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[ingest] fetch starting $(date -Is)"
docker compose --profile worker run --rm worker src/fetch-all.ts
echo "[ingest] fetch done $(date -Is)"

exec ops/enrich.sh
