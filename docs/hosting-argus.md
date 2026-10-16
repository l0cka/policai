# Hosting

The site is self-hosted by the maintainer behind a Cloudflare tunnel. A
timer on the host runs a guarded dispatcher that deploys `main`. This page
describes that deploy path. The operational runbook (server topology,
units, cutover and rollback procedure) is kept privately by the maintainer.

## Cadence

The pull timer, `policai-pull.timer`, fires every 2 minutes with up to
15 seconds of random jitter. A run that finds nothing to deploy takes about
10 seconds. A merged commit goes live on the next cycle that finishes, so
allow a few minutes, plus build time for code changes.

## Lane routing

Each cycle, the dispatcher compares the new `main` with the deployed
commit and routes each changed path by the first matching row of `ROUTES`
in `ops/host/dispatcher.py`. A change set selects the union of its paths'
lanes. A lane that is not selected fast-forwards to the new commit with
no build and no restart, so both checkouts hold the new commit after every
verified cycle.

| Changed paths | Lanes |
| --- | --- |
| Test files (`*.test.ts`, `*.test.tsx`, any `__tests__/` directory) | None |
| `data/`, `public/data/` (ISR serves the new data) | None |
| Markdown outside any `public/` directory | None |
| `docs/`, `.github/`, `ops/host/`, `ops/collector/`, `scripts/` | None |
| `apps/probono/` | Rebuild Pro Bono. Policai is not restarted. |
| `src/`, `public/`, `mcp/`, `design/` | Rebuild and restart Policai. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next.config.js`, `next.config.mjs`, `postcss.config.mjs`, `components.json` | Rebuild and restart Policai. |
| Any other path | Rebuild both. |

This table describes `main`. The host runs a copy of the dispatcher that
only a reviewed install refreshes, so it routes this way after the next
install. Until then the installed copy routes `data/` and `public/data/` to
no lane, `src/`, `public/`, `mcp/` and the Next.js and shadcn config files
to Policai, `apps/probono/` to Pro Bono, and every other path to both
lanes. The invariant behind the no-lane rows is in
[`ops/host/README.txt`](../ops/host/README.txt).

## Health gate and failure

A deploy counts as done only when each rebuilt lane passes its health
check and the dispatcher reports `verified: true`. A failed deploy writes
a persistent gate. Every later timer cycle then refuses to deploy,
including data-only commits, until a reviewed recovery clears it. Pushing
a fix to `main` does not clear the gate.

Recovery is a manual, reviewed step by the maintainer. The procedure is in
[`ops/host/README.txt`](../ops/host/README.txt) under "FAILURE / RECOVERY".

## What this means for contributors

- Merging to `main` is a deploy trigger. Check the timer before you push a
  production-tracked branch.
- A data commit is public after the next cycle, not instantly.
- A red deploy blocks everyone's changes. Tell the maintainer rather than
  retrying.

The collector runs separately and pushes data commits through the same
path. See [collector.md](./collector.md).
