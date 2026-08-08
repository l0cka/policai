#!/usr/bin/env bash
# Requeue items the enrichment agent marked irrelevant, so they are judged
# again under the corrected relevance bar in RUNBOOK.md.
#
# Background: on 2026-08-07 a 1,653-item ingest overwhelmed the pass budget and
# the agent began stamping one source-level verdict across every item from a
# source — dozens of community legal centres had all ten of their items
# rejected with a single identical blurb. RUNBOOK.md now forbids that and caps
# each pass at one batch. This script puts the affected items back in the queue.
#
# Sources deactivated by db/migrations/2026-08-08-wrong-site-feeds.sql are left
# alone: those rejections were correct.
#
# Usage: ops/requeue-rejected.sh [batch-size]   (default 200, 0 = all)
set -euo pipefail
cd "$(dirname "$0")/.."

LIMIT="${1:-200}"
LIMIT_SQL="LIMIT $LIMIT"
if [ "$LIMIT" = "0" ]; then LIMIT_SQL=""; fi

read -r -d '' SQL <<SQL || true
WITH candidates AS (
  SELECT i.id
  FROM items i
  JOIN sources s ON s.id = i.source_id
  WHERE NOT i.relevant
    AND i.enriched_at IS NOT NULL
    AND s.active
  ORDER BY i.created_at ASC
  $LIMIT_SQL
)
UPDATE items SET enriched_at = NULL
WHERE id IN (SELECT id FROM candidates);
SQL

echo "[requeue] resetting up to ${LIMIT} rejected items from active sources"
docker compose exec -T db psql -U radar -d radar -c "$SQL"
docker compose exec -T db psql -U radar -d radar -c \
  "SELECT count(*) FILTER (WHERE enriched_at IS NULL) AS queued,
          count(*) FILTER (WHERE NOT relevant AND enriched_at IS NOT NULL) AS still_rejected
   FROM items;"
echo "[requeue] the 4-hourly timer will work through these 40 at a time"
