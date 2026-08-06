#!/usr/bin/env bash
# Deploy Pro Bono Radar to Argus. Idempotent.
set -euo pipefail
HOST=argus
DEST=/home/l0cka/services/probono-radar/src

echo "== sync =="
ssh "$HOST" "mkdir -p $DEST"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '.env' --exclude '.claude' \
  ./ "$HOST:$DEST/"

echo "== build & start db + dashboard =="
ssh "$HOST" "cd $DEST && docker compose --profile worker build && docker compose up -d db dashboard"

echo "== apply schema + seed =="
ssh "$HOST" "cd $DEST && docker compose exec -T db psql -U radar -d radar < db/schema.sql && docker compose exec -T db psql -U radar -d radar < db/seed.sql"

echo "== install systemd user units =="
ssh "$HOST" "mkdir -p ~/.config/systemd/user && cp $DEST/ops/probono-*.service $DEST/ops/probono-*.timer ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now probono-ingest.timer probono-digest.timer"

echo "== verify =="
ssh "$HOST" "cd $DEST && docker compose ps && systemctl --user list-timers 'probono-*' --no-pager"
