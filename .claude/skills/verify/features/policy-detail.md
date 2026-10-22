# Policy detail

`/policies/<id>` shows one public record: summary, requirements, full text, source verification, change history, related instruments and articles that cite it.

## Sub-features

- `detail-tabs` switches the `Policy sections` tabs `Overview`, `Key requirements` and `Full text`.
- `detail-related` lists related instruments, supersession first, eight server-rendered with `Show all N related`.
- `detail-share` puts `Copy link`, `Download data` and `Markdown with sources` under the `More` disclosure, beside `View official source` and `Follow`.
- `detail-markdown` serves the record as Markdown at `/api/policies/<id>/markdown`.
- `detail-hidden` returns 404 for withheld, unverified or trashed records.

## How to get to it (user POV)

- Choose a record title in the register.
- Choose an item under `heading "Related instruments"` on another record.
- Open `/policies/<id>` directly.

## Driving it with Playwright

Preconditions:

- Doctor is green. `federal-court-gpn-ai` (13 related), `voluntary-ai-safety-standard` (superseded) and `nsw-responsible-ai-guidance` (no related) are public.

- **Overview.** Run `$V snap <port> /policies/federal-court-gpn-ai detail-gpn`. `main h1` is `GPN-AI — Use of Generative Artificial Intelligence`; the aria snapshot has `tablist "Policy sections"` with `tab "Overview" [selected]`.
- **Related, all states.** Run `$V script <port> related`. It checks eight visible items, the expander, supersession order and the empty case, with and without JavaScript, light and dark, desktop and phone.
- **No JavaScript.** Run `$V snap <port> /policies/federal-court-gpn-ai detail-nojs --no-js`. The related list and summary are present in the snapshot.
- **Markdown.** Run `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:<port>/api/policies/federal-court-gpn-ai/markdown`. Prints `200 text/markdown...`.
- **Hidden record.** Pick a withheld or unverified id from `data/policies.json` and `data/source-reviews.json`, then `$V snap <port> /policies/<id> detail-hidden`. Status is `404` (the snap exits non-zero by design; read the JSON).

## Gotchas

- The related count is computed from themes, so it moves when themes change; assert against the page, not a constant.
- There is deliberately no `loading.tsx` under `src/app/policies/[id]/`; a skeleton in a no-JS snapshot is a regression (#303).
