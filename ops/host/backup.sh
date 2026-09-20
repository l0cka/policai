#!/bin/bash
# Reviewed equivalent of the existing host backup helper, with canonical source.
# This script MUST be launched by cli.py worker backup with the guarded Docker shim.
set -euo pipefail
COMPOSE=/var/lib/probono-radar/app/apps/probono/docker-compose.yaml
OUT=/home/l0cka/Backups/probono-radar
STAMP=$(date -u +%F)
TMP=$(mktemp "$OUT/.radar-$STAMP.XXXXXX.sql.gz")
GTMP=$(mktemp "$OUT/.globals-$STAMP.XXXXXX.sql.gz")
trap 'rm -f "$TMP" "$GTMP"' EXIT

docker compose -f "$COMPOSE" exec -T db pg_dump -U radar radar | gzip > "$TMP"
gunzip -t "$TMP"
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 10240 ]; then
  printf 'backup too small; refusing replacement\n' >&2
  exit 1
fi
# Match the COMPLETION terminator, not the header banner. pg_dump writes
# '-- PostgreSQL database dump' before any data, so the old header-only check
# accepted a dump truncated anywhere after the 10 KiB floor above.
zgrep -q -m1 'PostgreSQL database dump complete' "$TMP"
mv "$TMP" "$OUT/radar-$STAMP.sql.gz"

# Cluster-level globals: roles, their membership and their passwords. pg_dump is
# database-scoped and emits OWNER TO statements without the matching CREATE ROLE,
# so a restore into a fresh cluster fails every ownership statement and leaves the
# application unable to read its own tables. This file is what makes the dump above
# restorable onto bare metal.
#
# It contains role password hashes: keep it 0600, never commit it, never print it.
docker compose -f "$COMPOSE" exec -T db pg_dumpall -U radar --globals-only | gzip > "$GTMP"
gunzip -t "$GTMP"
if ! zgrep -q -m1 'CREATE ROLE' "$GTMP"; then
  printf 'globals dump has no CREATE ROLE; refusing replacement\n' >&2
  exit 1
fi
chmod 600 "$GTMP"
mv "$GTMP" "$OUT/globals-$STAMP.sql.gz"
trap - EXIT

# Existing policy: older than 14 days, while keeping the newest five dumps.
ls -1t "$OUT"/radar-*.sql.gz | tail -n +6 | while read -r f; do
  if [ -n "$(find "$f" -mtime +14)" ]; then rm -f "$f"; fi
done
# Same policy for the globals series, kept in step with the dumps it restores with.
ls -1t "$OUT"/globals-*.sql.gz | tail -n +6 | while read -r f; do
  if [ -n "$(find "$f" -mtime +14)" ]; then rm -f "$f"; fi
done
printf 'backup verified\n'
