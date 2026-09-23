#!/usr/bin/env bash
# One deadline-verification pass: re-read the source page of each item whose
# action deadline is upcoming or closed in the last 30 days, ask the verifier
# model (no tools) for a verdict on every stored date, and save the verdicts
# that pass the deadline rules.
#
# Daily. The T-7 re-check and the weekly staleness rule live in the worker's
# list query (src/lib/deadline-verify.ts selectItemsToVerify), not here.
set -euo pipefail
cd "$(dirname "$0")/.."

# Two passes would verify the same items twice; a pass arriving while another
# runs skips. Tomorrow's tick picks up anything left.
exec 9>/tmp/probono-verify-deadlines.lock
if ! flock -n 9; then
  echo "[verify-deadlines] another pass holds the lock, skipping $(date -Is)"
  exit 0
fi

echo "[verify-deadlines] starting $(date -Is)"

PROBONO_DOCKER_BIN="${PROBONO_DOCKER_BIN:-docker}"
# Bounded batch; the worker clamps it to 1..50 as well.
VERIFY_BATCH=25

# The worker lists the items, fetches each page and calls the OpenAI-compatible
# verifier (VERIFIER_BASE_URL / VERIFIER_API_KEY / VERIFIER_MODEL from the
# host env file) with no tools. Page text and model output stay data: this
# script never executes either, and every save re-validates the verdicts.
proposals="$("$PROBONO_DOCKER_BIN" compose --profile worker run --rm worker src/verify-deadlines.ts)"

checked="$(
  printf '%s' "$proposals" \
    | jq -ce --argjson max "$VERIFY_BATCH" '
        if type == "array" and length <= $max
           and all(.[]; (.item_id | type == "number" and . > 0 and floor == .)
                        and (.model | type == "string" and length > 0 and length <= 100))
           and ((map(.item_id) | unique | length) == length)
        then .
        else error("invalid verification batch")
        end
      '
)"

count="$(printf '%s' "$checked" | jq -r 'length')"
if [[ "$count" == "0" ]]; then
  echo "[verify-deadlines] nothing to save $(date -Is)"
  exit 0
fi

for ((index = 0; index < count; index++)); do
  item_id="$(printf '%s' "$checked" | jq -er ".[$index].item_id")"
  payload="$(printf '%s' "$checked" | jq -ce ".[$index] | {model, output}")"
  printf '%s' "$payload" \
    | "$PROBONO_DOCKER_BIN" compose --profile worker run --rm -T worker src/save-deadline-verification.ts "$item_id" \
    || echo "[verify-deadlines] item $item_id not saved" >&2
done

echo "[verify-deadlines] done: $count item(s) $(date -Is)"
