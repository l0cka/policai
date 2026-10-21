# Policy register

The home page lists every public register record (verified, not trashed, not withheld) and lets a reader search, filter, sort and page through them in a list or table.

## Sub-features

- `register-search` filters records by text in title, agency or topic.
- `register-filter` narrows by jurisdiction, status and other filter groups, with removable chips.
- `register-sort` orders records through the `Sort policies` select or table headers.
- `register-view` switches between `List` and `Table`.
- `register-page` pages with `Previous` and `Next`.
- `register-clear` resets search and filters.

## How to get to it (user POV)

- Open `/` or choose `link "Register"` in the header.
- Type in `searchbox "Search policies, agencies or topics"`.
- Open a URL with `?q=<text>` and optionally `&view=table`.
- Choose a jurisdiction button such as `button "Federal 33"` in the jurisdiction summary.

## Driving it with Playwright

Preconditions:

- Doctor is green on `<port>`.

- **Landing.** Run `$V snap <port> / register-home`. `main h1` is `Australian AI policy.` and `passed` is `true`.
- **URL search.** Run `$V snap <port> '/?q=assurance&view=table' register-search`. The aria snapshot shows the searchbox value `assurance`, a `table`, and `button "Table" [pressed]`.
- **Full journey.** Run `$V script <port> editorial`. It drives search, filter chips (`Remove filter: Active`), `Clear search and filters`, header sort buttons, `Next`, `Table` and `List`, and the mobile menu; its JSON lists each check.
- **Phone.** Run `$V snap <port> / register-phone --phone`. No overflow, and `button "Open menu"` replaces the inline nav.

## Gotchas

- `/` is prerendered at build time. A change to `data/policies.json` shows only after `$V build` and a restart.
- Jurisdiction counts in button names (`Federal 33`) move with the data; match with a regex, not the exact count.
- `List` is the default view; `Table` state is in the URL as `view=table`.
