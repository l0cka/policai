# Coverage map

`/coverage` is a table of themes by jurisdiction. Each count cell opens a drill-down listing the records behind it; the selection lives in the URL.

## Sub-features

- `coverage-matrix` renders themes (rows) by the nine jurisdictions (columns), or instrument types with `by=type`.
- `coverage-select` opens a cell, row or column drill-down by click, keyboard or URL.
- `coverage-clear` closes it with `Clear selection` or Escape and returns focus.
- `coverage-scroll` keeps the drill-down heading clear of the sticky header and column strip.
- `coverage-redirect` sends `/network` to `/coverage` with a 308.

## How to get to it (user POV)

- Choose `link "Register"` in the header, then `link "Coverage map"` in `navigation "Register views"`.
- Open `/coverage?theme=<key>&j=<jurisdiction>` (deep link), `?theme=` alone, `?j=` alone, or `?by=type&type=<key>`.
- Open the old `/network` URL.

## Driving it with Playwright

Preconditions:

- Doctor is green. Theme `courts-tribunals` has NSW records.

- **Deep link.** Run `$V snap <port> '/coverage?theme=courts-tribunals&j=nsw' coverage-deeplink`. The aria snapshot contains `heading` for the drill-down and `button "Clear selection"`.
- **Click, scroll, FAB.** Run `$V script <port> coverage`. It clicks `button` named `Courts and tribunals, New South Wales: ...`, checks heading clearance on phone and desktop in light and dark, and checks `Clear selection` is clear of `Scroll to top` at 430x932.
- **Type axis.** Run `$V snap <port> '/coverage?by=type' coverage-type`.
- **Redirect.** Run `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'http://127.0.0.1:<port>/network?x=1'`. Prints `308 http://127.0.0.1:<port>/coverage?x=1` (the query string is carried over).

## Gotchas

- Cell buttons hydrate after load; wait for React props on `main table button` (as the script does) before clicking, or the click is lost.
- Counts come from the public read, so a withheld record never appears in a cell; `src/app/coverage/page.test.tsx` covers that, the browser run does not need to.
