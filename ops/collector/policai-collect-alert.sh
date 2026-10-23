#!/usr/bin/env bash
# Failure alert for the Argus collector (OnFailure= of policai-collect.service):
# open one `collector-failure` issue, or comment on the open one, with the
# failed run's own receipt so the reason is the run's, not stale journal lines.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

REPO="l0cka/policai"
RECEIPT="$HOME/.local/state/argus-jobs/policai-collect.json"
SUMMARY=$(python3 -I - "$RECEIPT" <<'PY' 2>/dev/null || echo "receipt unavailable"
import json, sys
run = json.load(open(sys.argv[1]))
for key in ('run_id', 'phase', 'exit_code', 'message', 'evidence', 'pr'):
    if run.get(key) not in (None, ''):
        print(f'{key}: {run[key]}')
PY
)
LOG=$(journalctl --user -u policai-collect.service -n 20 --no-pager -o cat 2>/dev/null || echo "journal unavailable")
BODY=$(printf 'The collection run on argus failed at %s UTC.\n\n```\n%s\n```\n\nLast journal lines:\n```\n%s\n```' \
  "$(date -u '+%F %T')" "$SUMMARY" "$LOG")

gh label create collector-failure --repo "$REPO" \
  --description "Automated alert from the Argus collector" --color D93F0B 2>/dev/null || true

EXISTING=$(gh issue list --repo "$REPO" --label collector-failure --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
if [ -n "$EXISTING" ]; then
  gh issue comment "$EXISTING" --repo "$REPO" --body "$BODY"
else
  gh issue create --repo "$REPO" --title "Argus collection run is failing" \
    --label collector-failure --body "$BODY"
fi
