# Policai verification map

The maintained source for verifying what a Policai reader sees. Read this index, then the feature file for what you changed, and drive every entry point it lists that your change touches.

## Baseline preconditions

- A production build of the current tree, served by `policai-verify start <port>` on `127.0.0.1` (default `8894`).
- `policai-verify doctor <port>` prints only `ok` lines.
- Data is the committed JSON in `data/` and `public/data/`. There is no seed step and nothing to restore: the site has no write path.
- Never drive production (`8797`, `3010`, `policai.org`) or a dev server you did not start.

## Driving conventions

- `V=.claude/skills/verify/bin/policai-verify`, run from the repository root.
- One state: `$V snap <port> '<path>' <name> [--phone] [--dark] [--no-js]`.
- A journey with clicks: an existing `scripts/verify-*.mjs` through `$V script`, or a short Playwright script using `getByRole` and the accessible names in these files.
- Many states are URL parameters. Prefer the URL entry point plus the click entry point when both exist.
- The main nav (`navigation "Primary"`: `link "Register"`, `"Updates"`, `"Legislation"`, `"Courts"`, `"Analysis"`, then `"About"` and `"A2J"` on the right) collapses behind `button "Open menu"` below 1024px. Sections and their views are defined once in `src/lib/site-nav.ts`. The collector status is `link "Source status: …"` in the header bar; the theme radios (`radiogroup "Colour theme"`) are in the footer.

## Proof and skip reporting

- Capture the action and the resulting state: a URL or click, then a snapshot or script JSON.
- UI proof is the `.png`, `.aria.yml` and `.json` from `snap`, with `passed: true`.
- API proof is the `curl` command and its JSON body.
- Record the feature ID and entry point with every artifact.
- Report an unreachable entry point with the command tried and the unmet precondition. Never report it verified through a different entry point.

## Feature entry contract

Each file has an H1, one paragraph, and four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Policy register](./register.md): home page search, filters, sort, table and list views, pagination.
- [Policy detail](./policy-detail.md): `/policies/[id]` tabs, related instruments, markdown and data downloads.
- [Coverage map](./coverage.md): themes by jurisdiction, drill-down, URL state.
- [Analysis](./analysis.md): article index, type filters, article pages, Atom feed.
- [This week](./this-week.md): verified developments and upcoming dates.
- [Public API](./api.md): read-only JSON routes and their public filtering.
