---
name: verify
description: Drive the real Policai site (Next.js register of Australian AI policy) in a loopback production build and capture proof. Use to prove a UI, route, API or data change works the way a reader sees it, before handing off or opening a PR. Not for Pro Bono Radar (apps/probono) or the collector.
---

# Verify Policai

Policai is a read-only Next.js site over Git-backed JSON. Readers touch the web UI and the read-only `/api/*` JSON routes. There is no auth, no database and no runtime write path, so a verification run never mutates data; it only builds, serves and reads.

Prove changes against a **production build** on loopback, not `next dev`. Several behaviours (ISR, `force-dynamic` routes, no-JS rendering, hydration errors such as #284) differ in dev.

All commands below run from the repository root through one helper:

```bash
V=.claude/skills/verify/bin/policai-verify
```

## Launch

1. `$V build` installs dependencies with `npm ci` when `node_modules` is missing or older than the lockfile, runs `npm run build`, and records the built `HEAD` and working-tree state in `.next/`. It takes about a minute. A failure here is a build failure of your change: report it, do not drive.
2. `$V start [port]` (default `8894`) serves the build as the user unit `sandbox-policai-verify-<port>`, bound to `127.0.0.1`. It refuses a port that already has a listener. It returns once `GET /api/status` answers 200 and prints `ready http://127.0.0.1:<port>`.

To preview article fixtures, export `POLICAI_ARTICLES_DIR=$PWD/src/test/fixtures/articles` before `start`; the unit inherits it.

Never verify against `127.0.0.1:8797`, `3010`, the user's `npm run dev` on `3000`, or `policai.org`. Production is served from `~/Work/Argus/live/policai`, a different checkout, and is not this skill's to touch.

## Doctor

```bash
$V doctor [port]
```

Read-only. Every line must be `ok`:

- the unit is active;
- the listener on the port belongs to that unit's cgroup (so you are driving your instance, not someone else's);
- `/api/status` returns 200;
- the build matches the current `HEAD` and working tree (ignoring `.claude/`). `STALE` means you edited source after building: `$V stop`, `$V build`, `$V start`.

Run it first, and again whenever a result looks wrong.

## Drive

Two drivers, both Playwright (`playwright-core` with `/usr/bin/chromium`, override with `CHROMIUM_BIN`):

**Snapshot any route.** One page, one state, full evidence:

```bash
$V snap <port> '<path?query>' <name> [--phone] [--dark] [--no-js]
```

It writes `<name>.png` (full page), `<name>.aria.yml` (ARIA snapshot of `body`) and `<name>.json` (status, title, `main h1`, console and page errors, 4xx/5xx requests, horizontal overflow), and exits non-zero unless status is 200 with no errors, no failed requests and no overflow. Most features are URL-addressable (`/?q=`, `/coverage?theme=&j=`), so a URL plus a snapshot proves a state.

**Feature scripts.** Interactive journeys already exist in `scripts/verify-*.mjs`. Run the ones that take `POLICAI_VERIFY_URL` through the helper, which sets the URL and a per-script evidence folder:

```bash
$V script <port> coverage    # coverage map: deep link, click, scroll clearance, phone FAB
$V script <port> related     # related instruments, with and without JS, light and dark
$V script <port> editorial   # register filters, theme radio, article pages
```

`verify-this-week.mjs` and `verify-research-ui.mjs` also drive the A2J dashboard and need its editorial fixture on `127.0.0.1:8896`; see `features/this-week.md`.

For a journey no script covers, write a small Playwright script next to your evidence (not in the repo unless the change deserves a permanent check) using the handles in the feature map. Prefer `getByRole` with accessible names; the map lists the real ones.

The feature map in `features/` is the recipe book. Read `features/README.md`, then the file for the feature you changed. Cover every entry point it lists that your change touches.

## Evidence

Evidence goes to `$POLICAI_EVIDENCE_DIR`, default `~/Reports/<YYYY-MM-DD>-policai-verify/` (`$V evidence` prints it). It is outside the checkout and survives cleanup.

Proof standards:

- Drive the reader's path: navigation links, URL parameters, buttons. Do not call data-service functions or import components to "prove" a page.
- Capture the action and the resulting state: a before snapshot, the action (URL or click), and an after snapshot, or a script's JSON results.
- For data changes, show the record both in the UI (`/policies/<id>`) and in the API (`curl -s http://127.0.0.1:<port>/api/policies/<id>`), and show that withheld, unverified or trashed records do not appear.
- Check light and dark, desktop and `--phone` when layout or styling changed; `--no-js` when server rendering is the point.
- Fail on any console error, page error, 4xx/5xx or overflow; the snapshot JSON records them.

Report the evidence path, the doctor output and each artifact with the feature ID and entry point it proves.

## Cleanup

```bash
$V stop [port]
```

Stops and resets only `sandbox-policai-verify-<port>`, confirms the port is free, and prints the evidence path, which it leaves in place. Never kill `next` by process name: other Policai instances (production, the user's dev server) run on this host. The build output in `.next/` stays; it is Git-ignored.

## Gotchas

- A fresh checkout has no `node_modules`; `npx next` then fetches a temporary Next and the build fails with "Could not find the Next.js package". `$V build` runs `npm ci` first.
- `npm ci` warns that `unrs-resolver`'s postinstall was not run. The build does not need it.
- `/coverage`, `/this-week`, `/analysis/[slug]` and `/policies/[id]` render per request; static routes (`/`, `/developments`, `/courts`) are prerendered at build time, so a data edit needs a rebuild before it shows there.
- `.claude/launch.json` points `npm` at a macOS path and does not work on this host; use this helper instead.
