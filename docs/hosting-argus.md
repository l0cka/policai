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
commit and routes by the paths that changed:

| Changed paths | Result |
| --- | --- |
| `data/`, `public/data/` only | Fast-forward with no build or restart. ISR serves the new data. |
| `src/`, `public/`, `mcp/`, Next.js and shadcn config files | Rebuild and restart Policai. |
| `apps/probono/` | Rebuild Pro Bono. Policai is not restarted. |
| Any other path | Rebuild both. |

A commit that touches several lanes runs each lane it touches. The
routing is `classify` in `ops/host/dispatcher.py`.

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
