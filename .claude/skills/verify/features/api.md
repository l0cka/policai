# Public API

Read-only JSON routes under `/api/` and static `/data/*.json` files expose only public records.

## Sub-features

- `api-policies` lists public policies at `/api/policies` and one at `/api/policies/<id>`.
- `api-status` reports collection health at `/api/status`.
- `api-other` serves `/api/developments`, `/api/timeline`, `/api/agencies`, `/api/network`, `/api/court-requirements`.
- `api-data` serves `/data/policies.json` and friends with public filters applied.

## How to get to it (user POV)

- Choose `link "API"` in the footer.
- Request the routes with any HTTP client.

## Driving it with Playwright

Preconditions:

- Doctor is green.

- **Status.** Run `curl -s http://127.0.0.1:<port>/api/status | head -c 300`. JSON with `lastCollectedAt` and `collection.health`.
- **Record.** Run `curl -s http://127.0.0.1:<port>/api/policies/federal-court-gpn-ai | head -c 300`. JSON for that record.
- **Hidden record.** Run `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<port>/api/policies/<withheld-id>`. Prints `404`.
- **Parity.** Compare ids: `curl -s http://127.0.0.1:<port>/data/policies.json` against the record list the register shows.

## Gotchas

- There is no write method on any route; a POST returning anything but 405 is a defect.
- `/data/*.json` is prerendered with hourly revalidation; rebuild after a data edit.
