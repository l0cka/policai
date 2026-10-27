# Hosting

policai.org and a2j.policai.org are served from Cloudflare Workers named
`policai` and `a2j`, built with OpenNext. The Pro Bono database and its jobs,
the collector and the CI runners stay on the maintainer's host, Argus. The operational runbook (server topology, units,
cutover and rollback procedure) is kept privately by the maintainer.

## policai.org on Workers

Cloudflare Workers Builds deploys the Worker on every push to `main`,
including auto-merges, which start no GitHub workflow. It runs
`npm run build:cloudflare`, then `npx opennextjs-cloudflare deploy`, with
`NODE_VERSION=24`. A commit that changes only `apps/probono/` is skipped.
The build settings live on the Worker in the Cloudflare dashboard, not in
this repository.

Workers have no project filesystem, so `scripts/bundle-data.mjs` bundles
`data/` and `public/data/` into the Worker at build time. Every commit to
`main`, data included, is public only after its build deploys, about three
minutes after the merge.

The routes for `policai.org/*` and `www.policai.org/*` are in
`wrangler.jsonc`. The workers.dev URL is off, so the Signal write API
answers only on policai.org. There is no rollback to Argus: the Policai server
there is retired, and the host dispatcher no longer builds it.

Signal reads `POLICAI_SIGNAL_TOKEN` and `POLICAI_SIGNAL_GITHUB_TOKEN` from
Worker secrets, set with `wrangler secret put` or in the dashboard.

## a2j.policai.org on Workers

Workers Builds deploys the `a2j` Worker from `apps/probono/dashboard` on
pushes to `main`. Its routes for `a2j.policai.org/*`
and `probono.policai.org/*` are in `apps/probono/dashboard/wrangler.jsonc`;
`middleware.ts` redirects the old probono name.

The Worker reads a Neon copy of the Pro Bono database through Hyperdrive. The
Postgres on Argus stays the database of record: ingest, enrichment, deadline
checks and backups write there, and the guarded `cli.py worker neon-sync`
(`probono-neon-sync.timer`, hourly at :45) replaces the Neon copy when the
data changed. The site can lag Argus by up to an hour. There is no rollback
to Argus: the dashboard container there is retired, and the host dispatcher
no longer builds it.

## Argus

A timer on Argus runs a guarded dispatcher that keeps the Pro Bono release
checkout at `main` and rebuilds the worker image the ingest, enrichment and
deadline-check timers run. The rest of this page describes that deploy path.

### Cadence

The pull timer, `policai-pull.timer`, fires every 2 minutes with up to
15 seconds of random jitter. A run that finds nothing to deploy takes about
10 seconds. A merged commit goes live on the next cycle that finishes, so
allow a few minutes, plus build time for code changes.

### Lane routing

Each cycle, the dispatcher compares the new `main` with the deployed
commit and routes each changed path by the first matching row of `ROUTES`
in `ops/host/dispatcher.py`. A change set rebuilds the worker image when
any of its paths selects the lane. Otherwise the checkout fast-forwards to
the new commit with no build, so it holds the new commit after every
verified cycle either way.

| Changed paths | Result |
| --- | --- |
| Test files (`*.test.ts`, `*.test.tsx`, any `__tests__/` directory) | Fast-forward only |
| Markdown outside any `public/` directory | Fast-forward only |
| `apps/probono/dashboard/` (the a2j Worker, built by Cloudflare) | Fast-forward only |
| Any other path under `apps/probono/` | Rebuild the worker image |
| Any other path | Fast-forward only |

The default is a fast-forward because the worker image is built from
`apps/probono/worker` alone, which `validate_compose` enforces, so a path
outside `apps/probono/` cannot change it.

The host runs a copy of the dispatcher that only a reviewed install
refreshes. The install of #550 on 26 October 2026 matches this table. The invariant behind the no-lane rows is in
[`ops/host/README.txt`](../ops/host/README.txt).

### Health gate and failure

A deploy counts as done only when the database identity, the worker
image and the loopback-only Postgres listener check out after activation
and the dispatcher reports `verified: true`. That result line also names
the commit it deployed:

```json
{"verified": true, "activated_lanes": ["probono"], "main": "<sha>", "heads": {"probono": "<sha>"}}
```

`activated_lanes` is `["probono"]` when the worker image was rebuilt and
empty when the cycle only fast-forwarded. `main` is the commit the cycle
resolved and deployed, and `heads` is the commit the checkout now holds. To confirm a merge went
live, look for a verified run whose `main` is the merge commit or a later
commit on `main`, not for a run that happened after the merge. A failed or
refused run prints no result and no commit.

A failed deploy writes
a persistent gate. Every later timer cycle then refuses to deploy,
including data-only commits, until a reviewed recovery clears it. Pushing
a fix to `main` does not clear the gate.

Recovery is a manual, reviewed step by the maintainer. The procedure is in
[`ops/host/README.txt`](../ops/host/README.txt) under "FAILURE / RECOVERY".

### What this means for contributors

- Merging to `main` deploys each site it touches through Workers Builds and, for
  `apps/probono/` changes outside `dashboard/`, the Pro Bono worker image.
- A red deploy blocks the Pro Bono jobs and every later cycle. Tell the
  maintainer rather than retrying. The sites keep deploying through
  Workers Builds regardless.

The collector runs separately and pushes data commits, which Workers
Builds publishes. See [collector.md](./collector.md).
