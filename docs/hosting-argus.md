# Hosting

policai.org is served from a Cloudflare Worker named `policai`, built with
OpenNext. The Pro Bono site, the collector and the CI runners stay on the
maintainer's host, Argus. The operational runbook (server topology, units,
cutover and rollback procedure) is kept privately by the maintainer.

## policai.org on Workers

`.github/workflows/cloudflare-deploy.yml` builds the site with
`npm run build:cloudflare` and deploys it with `opennextjs-cloudflare
deploy` from a GitHub-hosted runner. The API token lives only in the
`cloudflare-preview` GitHub environment.

Workers have no project filesystem, so `scripts/bundle-data.mjs` bundles
`data/` and `public/data/` into the Worker at build time. Every commit to
`main`, data included, needs a deploy before it is public. A push to `main`
starts one. Auto-merge pushes through `GITHUB_TOKEN`, which starts no
workflow, so a five-minute schedule also deploys whenever `main` is newer
than the last successful deploy. Allow up to about ten minutes for a merge
to go live.

The routes for `policai.org/*` and `www.policai.org/*` are in
`wrangler.jsonc`. The workers.dev URL is off, so the Signal write API
answers only on policai.org. To roll back to Argus, delete them and deploy; the tunnel
CNAMEs still point at the host, which keeps running Policai.

Signal reads `POLICAI_SIGNAL_TOKEN` and `POLICAI_SIGNAL_GITHUB_TOKEN` from
Worker secrets, set with `wrangler secret put` or in the dashboard.

## Argus

A timer on Argus runs a guarded dispatcher that deploys `main` to the Pro
Bono site and to the Policai copy kept there for rollback. The rest of this
page describes that deploy path.

### Cadence

The pull timer, `policai-pull.timer`, fires every 2 minutes with up to
15 seconds of random jitter. A run that finds nothing to deploy takes about
10 seconds. A merged commit goes live on the next cycle that finishes, so
allow a few minutes, plus build time for code changes.

### Lane routing

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

### Health gate and failure

A deploy counts as done only when each rebuilt lane passes its health
check and the dispatcher reports `verified: true`. That result line also
names the commit it deployed:

```json
{"verified": true, "activated_lanes": ["policai"], "main": "<sha>", "heads": {"policai": "<sha>", "probono": "<sha>"}}
```

`activated_lanes` lists the rebuilt lanes and is empty when no lane needed
a rebuild. `main` is the commit the cycle resolved and deployed, and
`heads` is the commit each checkout now holds. To confirm a merge went
live, look for a verified run whose `main` is the merge commit or a later
commit on `main`, not for a run that happened after the merge. A failed or
refused run prints no result and no commit. The host reports these fields
only after a reviewed install of the current dispatcher.

A failed deploy writes
a persistent gate. Every later timer cycle then refuses to deploy,
including data-only commits, until a reviewed recovery clears it. Pushing
a fix to `main` does not clear the gate.

Recovery is a manual, reviewed step by the maintainer. The procedure is in
[`ops/host/README.txt`](../ops/host/README.txt) under "FAILURE / RECOVERY".

### What this means for contributors

- Merging to `main` is a deploy trigger. Check the timer before you push a
  production-tracked branch.
- A data commit is public after the next cycle, not instantly.
- A red deploy blocks everyone's changes. Tell the maintainer rather than
  retrying.

The collector runs separately and pushes data commits through the same
path. See [collector.md](./collector.md).
