#!/bin/bash
# Reviewed equivalent of the existing host backup helper, with canonical source.
# This script MUST be launched by cli.py worker backup with the guarded Docker shim.
set -euo pipefail
COMPOSE=/var/lib/probono-radar/app/apps/probono/docker-compose.yaml
OUT=/home/l0cka/Backups/probono-radar
STAMP=$(date -u +%F)
TMP=$(mktemp "$OUT/.radar-$STAMP.XXXXXX.sql.gz")
trap 'rm -f "$TMP"' EXIT

docker compose -f "$COMPOSE" exec -T db pg_dump -U radar radar | gzip > "$TMP"
gunzip -t "$TMP"
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 10240 ]; then
  printf 'backup too small; refusing replacement\n' >&2
  exit 1
fi
zgrep -q -m1 'PostgreSQL database dump' "$TMP"
mv "$TMP" "$OUT/radar-$STAMP.sql.gz"
trap - EXIT

# Existing policy: older than 14 days, while keeping the newest five dumps.
ls -1t "$OUT"/radar-*.sql.gz | tail -n +6 | while read -r f; do
  if [ -n "$(find "$f" -mtime +14)" ]; then rm -f "$f"; fi
done
printf 'backup verified\n'
