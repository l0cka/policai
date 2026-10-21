# This week

`/this-week` shows the week's verified developments and upcoming deadline dates, and links to A2J opportunities.

## Sub-features

- `week-developments` lists verified developments under `heading "Verified developments"`.
- `week-upcoming` lists future deadline dates under `heading "Coming up"`.
- `week-opportunities` shows A2J opportunities in `#week-opportunities` when the A2J dashboard is reachable.

## How to get to it (user POV)

- Choose `link "This week"` in the header (it gets `aria-current="page"`).
- Open `/this-week`.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- For `week-opportunities`, the A2J dashboard fixture runs on `127.0.0.1:8896` with `FIXTURE_WEEKLY=1` (see `apps/probono/AGENTS.md`).

- **Page.** Run `$V snap <port> /this-week week` and `--phone`. `main h1` is `This week` and both H2s are present.
- **Full journey with A2J.** Run `EVIDENCE_DIR="$($V evidence)/this-week" POLICAI_TEST_URL=http://127.0.0.1:<port> node scripts/verify-this-week.mjs`. It asserts 2 opportunities and 6 developments and runs axe.

## Gotchas

- `verify-this-week.mjs` and `verify-research-ui.mjs` use `EVIDENCE_DIR` and `POLICAI_TEST_URL`, not the `POLICAI_*` names, so `$V script` does not run them. Without the A2J fixture they fail on the opportunities count; report that as an unmet precondition.
- The page is per request and date-dependent: upcoming dates in the past drop off.
