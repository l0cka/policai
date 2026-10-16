#!/bin/bash
set -euo pipefail
SRC=${PROBONO_MIRROR_SOURCE:?}
MOUNT=${PROBONO_MIRROR_MOUNT:?}
DST=${PROBONO_MIRROR_DESTINATION:?}

if ! findmnt -M "$MOUNT" >/dev/null 2>&1; then
  printf 'mirror: %s is not mounted; refusing to write to the root disk\n' "$MOUNT" >&2
  exit 1
fi
if [ ! -d "$SRC" ]; then
  printf 'mirror: source %s missing\n' "$SRC" >&2
  exit 1
fi
mkdir -p "$DST"

rsync -a --ignore-existing --chmod=F600 \
  --include='radar-*.sql.gz' --include='globals-*.sql.gz' --exclude='*' \
  "$SRC"/ "$DST"/

bad=0
for f in "$DST"/radar-*.sql.gz "$DST"/globals-*.sql.gz; do
  [ -e "$f" ] || continue
  if ! gzip -t "$f" 2>/dev/null; then
    printf 'mirror: FAILED gzip check: %s\n' "$f" >&2
    bad=$((bad + 1))
  fi
done

(cd "$DST" && find . -maxdepth 1 \( -name 'radar-*.sql.gz' -o -name 'globals-*.sql.gz' \) -printf '%f\n' \
  | sort | xargs sha256sum > SHA256SUMS.txt.tmp && mv SHA256SUMS.txt.tmp SHA256SUMS.txt)

count=$(find "$DST" -maxdepth 1 \( -name 'radar-*.sql.gz' -o -name 'globals-*.sql.gz' \) | wc -l)
newest=$(find "$DST" -maxdepth 1 -name 'radar-*.sql.gz' -printf '%f\n' | sort | tail -1)
if [ "$bad" -ne 0 ]; then
  printf 'mirror: %s files, newest %s, %s FAILED integrity\n' "$count" "$newest" "$bad" >&2
  exit 1
fi
printf 'mirror: ok, %s files, newest %s\n' "$count" "$newest"
