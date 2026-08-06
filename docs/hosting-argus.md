# Policai on Argus, behind a Cloudflare tunnel

Design for Phase 1: move hosting from Vercel to the Argus server and serve it at
policai.org. Phase 2, replacing the GitHub Actions collector with a scheduled
Claude run, is deliberately out of scope and is specified separately.

Date: 2026-08-07

## Goal

policai.org serves the register from Argus. The Vercel deployment is retired
once the new host is proven, with no window where the site is unreachable and no
window where collection stops.

## Current state

Observed on 2026-08-06, not assumed:

- The live site is `policai.vercel.app`. `policai.com.au` appears in four places
  in the code but is not a live domain.
- `policai.org` is active in the "Tideflow" Cloudflare account, the same account
  as `tideflow.au`. It has two placeholder A records pointing at
  `103.42.108.46`, both proxied.
- Argus runs Ubuntu 26.04 with Node v22.23.2, 43 GB memory available and 1.7 TB
  free. User service linger is on for `l0cka`.
- Argus already runs one named cloudflared tunnel, `desk-webapp`, serving six
  `tideflow.au` hostnames from `~/.cloudflared/desk-webapp.yml` under the user
  unit `cloudflared-desk.service`.
- `cloudflared tunnel list` returns `unauthorized`, so the stored `cert.pem` can
  no longer manage tunnels.
- Ports 8789 and 8791 to 8793 are taken. 8794 is free.
- Argus authenticates to GitHub both by `gh` and by the SSH key
  `id_ed25519_github`.

Two properties of the application shape this design:

- `data-service` reads its JSON from `process.cwd()` at request time, and every
  page sets `revalidate = 3600`. New data on disk is therefore served within the
  hour with no rebuild and no restart.
- `/policies/[id]`, `/network` and `/api/*` are dynamic, and there is no
  `generateStaticParams`. A static export is not possible; the app needs a Node
  process.

## Non-goals

- Replacing the collector. GitHub Actions keeps running on its 19:30 UTC
  schedule throughout this phase.
- Moving `policai.com.au`. It is not live and is being dropped from the code
  rather than migrated.
- Changing the trust model or the methodology page. Those change in Phase 2,
  when what they describe actually changes.

## Architecture

```
GitHub (canonical data, unchanged)
        |  git pull, every 15 min
        v
~/live/policai            checkout on Argus
        |  next start
        v
127.0.0.1:8794            policai.service        (user systemd unit)
        |
        v
cloudflared               cloudflared-policai.service
        |
        v
policai.org, www.policai.org
```

Git stays the database. Argus is a reader: it pulls, it never pushes in this
phase. That keeps the cutover one-directional and makes rollback trivial.

## Components

### `policai.service`

Runs `next start -p 8794` from `~/live/policai`. A user unit, matching the
existing `desk-webapp.service` convention, with `Restart=on-failure` and
`RestartSec=10`. Depends on the checkout being built. Binds to loopback only, so
nothing is exposed except through the tunnel.

### `policai-pull.service` and `.timer`

Every 15 minutes: `git pull --ff-only`. If the pull changes anything under
`src/`, `package.json` or `package-lock.json`, it runs `npm ci` and
`npm run build` and restarts `policai.service`. If it only changes files under
`data/` or `public/data/`, it does nothing further, because ISR picks those up
on its own.

`--ff-only` is deliberate. Argus must never produce a merge commit or diverge
from origin; if it cannot fast-forward, that is a fault to report rather than
resolve automatically.

### `cloudflared-policai.service`

A dedicated named tunnel, `policai`, with its own config at
`~/.cloudflared/policai.yml` and its own unit. It is kept separate from
`desk-webapp` so that a mistake in Policai's ingress cannot affect the six
production `tideflow.au` hostnames.

Ingress:

```yaml
ingress:
  - hostname: policai.org
    service: http://127.0.0.1:8794
  - hostname: www.policai.org
    service: http://127.0.0.1:8794
  - service: http_status:404
```

### Domain references in the application

Four values change from `policai.com.au` to `policai.org`:

| File | Value |
| --- | --- |
| `src/app/layout.tsx` | `metadataBase` |
| `src/app/sitemap.ts` | `BASE_URL` |
| `src/app/robots.ts` | `sitemap` URL |
| `src/lib/pipeline/fetch.ts` | collector User-Agent |

The User-Agent one matters beyond tidiness: it is how the collector identifies
itself to the government sites it fetches, and the URL in it should resolve.

`www.policai.org` redirects to the apex so the two hostnames do not compete as
separate canonical URLs. The redirect is done in the application, as a `redirects()`
entry in `next.config.ts` matching on the `www` host, rather than as a Cloudflare
rule. That keeps the behaviour in the repository where it is reviewable and
testable, instead of as dashboard state nobody can see from the code.

## Deployment and update flow

Data changes need nothing. The pull timer writes new JSON and ISR serves it
within the hour.

Code changes need `git pull`, `npm ci`, `npm run build`, then a restart. The
pull timer does this automatically; it is also a single documented command to
run by hand.

The build runs on Argus. It has ample memory, and building elsewhere would mean
shipping artefacts around for no benefit.

## Cutover

1. Build and start the service on Argus. Verify locally over SSH with `curl`
   against `127.0.0.1:8794` while the site is still served by Vercel.
2. Create the tunnel. Do not route DNS yet.
3. Delete the two placeholder A records, then run `cloudflared tunnel route dns`
   for both hostnames. The order matters: the route command will not overwrite
   an existing record, so the A records must go first. This is the moment the
   site changes hands, and it is deliberately a single short step.
4. Verify policai.org and www.policai.org externally, in both themes, including
   a dynamic route and an API route.
5. Leave Vercel running for at least one collection cycle, so a full
   pull-to-serve round trip is proven on Argus.
6. Retire the Vercel project.

## Rollback

Each step reverses independently:

- Application faulty: `systemctl --user stop policai`, point DNS back. Vercel is
  still serving until step 6.
- Tunnel faulty: `systemctl --user stop cloudflared-policai`. The `desk-webapp`
  tunnel is untouched throughout, so tideflow.au is unaffected by anything here.
- Bad deploy: the checkout is a git clone, so `git reset --hard <sha>`, rebuild,
  restart.

The DNS change in step 3 is the only step with a propagation delay, and it is
the last one before verification.

## Failure modes

| Failure | Handling |
| --- | --- |
| Build fails during an automatic pull | Keep serving the old build. Do not restart on a failed build. Report. |
| `git pull` cannot fast-forward | Stop, do not merge, report. Someone has committed to the checkout. |
| `next start` exits | `Restart=on-failure` with a 10 second delay. |
| Tunnel drops | `Restart=on-failure`. Cloudflare serves its own error page meanwhile. |
| Disk fills | Out of scope here, but `.next` growth is worth watching; noted for observability. |

Failures are visible through `systemctl --user status` and the journal. Active
alerting is deferred to Phase 2, which introduces the alerting pattern for the
collector; the site failing is less urgent than collection failing silently,
because the site failing is externally obvious.

## Success criteria

- `https://policai.org` and `https://www.policai.org` serve the register over
  HTTPS, with `www` redirecting to the apex.
- A dynamic route (`/policies/<id>`) and an API route (`/api/policies`) both
  respond correctly.
- A data commit pushed to GitHub is visible on policai.org within the hour
  without any manual step.
- `systemctl --user restart policai` recovers the site.
- Rebooting Argus brings both units back automatically.
- The six `tideflow.au` hostnames are unaffected, verified before and after.

## Requires the operator

One step cannot be automated: `cloudflared tunnel login` opens a browser for
Cloudflare authorisation, because the stored certificate no longer has
permission to manage tunnels. Everything else follows from that.

## Carried into Phase 2

Recorded here so the next phase starts from evidence rather than a fresh survey:

- Argus can push to GitHub as `l0cka`, by `gh` token and by the
  `id_ed25519_github` SSH key. The Actions workflow currently pushes with a
  separate collector deploy key that is a bypass actor on the "Protect main"
  ruleset. Whether `l0cka` can push to `main` directly is unverified and is a
  precondition for Phase 2.
- Claude Code 2.1.221 is installed on Argus with credentials present.
  `ANTHROPIC_API_KEY` is not set in a non-interactive environment, so the auth
  model for an unattended run is an open question.
- The collector needs headless Chromium; the workflow installs it with
  `playwright-core install --with-deps chromium`.
- `collect.yml` contains two guards worth preserving: `npm run validate:data`,
  and a check that the collector never modifies `data/policies.json`. Both
  matter more, not less, once a model is involved.
- Phase 2 must rewrite the methodology page, `AGENTS.md` and the trust model,
  which currently state that analysis is deterministic with no external AI
  provider.
