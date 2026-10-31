# Pro Bono Radar

Monitors the Australian Pro Bono sector with a Postgres-backed dashboard and
agent-driven collection/enrichment workers. Public dashboard: https://a2j.policai.org.
Digest delivery is approval-gated; preserve the digest service and timer masks.

## Source, package and data boundaries

Canonical source is `apps/probono` in the Policai repository. Policai remains the
root application; this child is an independent application, not part of its
Git-backed JSON database or its Worker deployment. The imported Pro Bono history
is retained; do not replace it with a copy of a dirty runtime checkout.

`dashboard/` and `worker/` retain independent package manifests and lockfiles.
Run their installs, checks and builds separately from the root package:

```bash
# From the repository root
npm --prefix apps/probono/dashboard ci
npm --prefix apps/probono/worker ci
npm --prefix apps/probono/dashboard run typecheck
npm --prefix apps/probono/dashboard test
npm --prefix apps/probono/dashboard run build
npm --prefix apps/probono/worker run typecheck
env -u DATABASE_URL npm --prefix apps/probono/worker test
npm --prefix apps/probono/worker run test:security
```

The worker command above unsets `DATABASE_URL` and skips database integration
tests. Those tests delete rows. A shared Vitest setup file
(`worker/test/support/require-disposable-database.ts`) fails the run before any
query unless the connection `pg` will make has host `127.0.0.1` or `localhost`
and a database name ending in `_test`. It parses the URL with
`pg-connection-string`, the parser `pg` uses, so query parameters such as
`?host=` count. A URL that names no host or no database is refused, because
`pg` would fill the gap from `PGHOST` or `PGDATABASE`. Run the full worker suite only against a disposable database
such as `postgres://user:pass@127.0.0.1:5432/radar_test`, as the pull-request
workflow does with `probono_ci_test`. The compose `radar` database is refused.
Never use a production connection. Dashboard builds do not need a database.

`db/` holds schema, seeds and migrations, not the live database.
Postgres state and backups remain external to Git and application releases.
Secrets, environment files and SMTP credentials must remain outside Git. Never
copy live database contents or secret files into this subtree.

Spec: docs/superpowers/specs/2026-08-07-probono-radar-design.md
Deadline verifier (second pass over upcoming and recently closed deadlines):
docs/deadline-verifier.md

## Local dev

Run from `apps/probono`, on a development machine with an isolated database and
no production Compose stack. Schema/seed commands below are for that new local
database only. Keep the local `.env` untracked; never copy production secrets.
`NODEBIN` in the historical commands below means your local Node binary directory.

1. `cp .env.example .env` and set POSTGRES_PASSWORD.
2. `docker compose up -d db`
3. Apply schema: see below.
4. Worker: `cd worker && $NODEBIN/npm install && $NODEBIN/npx tsx src/fetch-all.ts`
5. Dashboard: `cd dashboard && $NODEBIN/npm install && $NODEBIN/npm run dev`

Apply schema/seed:
`docker compose exec -T db psql -U radar -d radar < db/schema.sql`
`docker compose exec -T db psql -U radar -d radar < db/seed.sql`

## Production boundary (Argus)

The public dashboard runs on the Cloudflare Worker `a2j`, reading an hourly
Neon copy of this database (see [docs/hosting-argus.md](../../docs/hosting-argus.md)).
Everything below, the database included, stays on Argus.

The cutover completed on 2026-09-23. The active child release is
`/var/lib/probono-radar/app/apps/probono`. The guarded host dispatcher runs
scheduled jobs from that tree. The former checkout at
`/home/l0cka/Work/Argus/services/probono-radar/src` is historical, not a runtime.
Verify unit working directories and container ownership before operational work.

Pro Bono retains its own release, rollback and health checks, separate from
Policai. Keep the existing Postgres volume, external backups and secret
configuration outside release trees. The database container can retain its
original Compose labels after the application cutover. Those labels alone do
not establish which checkout serves the dashboard.
The old `ops/deploy.sh` rsync deployment is removed; releases go through the
guarded host dispatcher. The reviewed service units installed on the host are
`ops/host/units/probono-*.service` at the repository root. `ops/*.timer` here
record the schedules only.
The maintainer keeps the operational runbook privately.

The `worker` Compose service runs on demand (systemd timers or by hand) and never
stays up. It uses host networking to reach Postgres on `127.0.0.1:5433` and
Firecrawl on `127.0.0.1:3003`, the socket-activated `firecrawl-proxy.socket`
entry point that wakes the idle Firecrawl stack (`3002` is the raw API and stays
down until something connects to `3003`). On a macOS development machine, skip the
container and run the worker scripts directly with `tsx`.

Ingest and enrichment use `probono-ingest.timer` and `probono-enrich.timer`;
backups remain a separate operational responsibility. Preserve masks on both
`probono-digest.service` and `probono-digest.timer`; no tracked unit file exists
for them. Unmasking requires explicit approval and verified SMTP configuration. Schema
changes, timer changes, deployment and live writes also require separate approval. See [AGENTS.md](./AGENTS.md) for child-specific rules.

`worker/src/save-enrichment.ts` exits 2 for a payload it rejects (malformed JSON or
failed validation). Before exiting it marks the item screened out
(`relevant = false`, `enriched_at` set, `blurb` holding the reason), so a payload
that keeps failing leaves the `list-unenriched.ts` queue instead of heading every
later batch. `ops/enrich.sh` counts each item as saved, rejected (exit 2) or failed
(any other status), attempts every item, and exits non-zero only when an item
failed or none was saved. `ops/requeue-rejected.sh` puts rejected items back in the
queue.

`worker/src/digest.ts` defaults to a dry run that prints the HTML. It sends only
when invoked with `--send` and `PROBONO_DIGEST_SEND_APPROVED=yes` is set, and
SMTP credentials alone never enable it. Docker Compose does not pass the approval
variable, so a sending run has to supply it deliberately. Compose passes no SMTP
settings either. The digest reads `SMTP_USER`, `SMTP_PASS` and `DIGEST_TO` from its
environment, so it cannot send from the worker container. To give the container
those credentials, use a Compose secret, never Compose environment, for the reason
under Database password. A period is one Sydney
calendar week by `digests.period_end`; the digest claims that week in a locked
transaction before sending and refuses when a row already exists, releasing the
claim if the send fails. Setting the variable is the approval step and still
needs the explicit approval above.

`worker/src/fetch-all.ts` exits explicitly once its run summary is printed and
the pool is closed. Without that exit a leftover handle holds the ingest
container open until the host dispatcher times out, and a worker left running
blocks later deployments and workers. Feed retrieval reads the response body
before it returns, including when the status is not 200.

## Database password

No container gets the `radar` password as an environment variable. Docker sends a
container's environment in the create request and keeps it in `docker inspect`,
and Argus's Docker authorization plugin logged create request bodies to the
journal. Compose reads `POSTGRES_PASSWORD` from the env file
(`/etc/probono-radar/runtime.env` on Argus, `.env` locally) into the
`postgres_password` secret, whose source is `environment: POSTGRES_PASSWORD`.
Compose creates the container first, then copies the secret into it as
`/run/secrets/postgres_password` (root-owned, mode 0444) through the archive
endpoint. That upload carries no `Content-Type: application/json`, so Docker does
not pass its body to an authorization plugin. No file under `/etc/probono-radar`
is needed for the secret. A `file:` source would be a bind mount, and the
container's `node` user can read it only if the host file's owner and mode allow
it.

- `db` gets `POSTGRES_PASSWORD_FILE`. The Postgres image reads it only when it
  initialises an empty data volume. The running Argus container was created
  from the earlier Compose file and keeps the password in its environment until
  it is recreated, which is a separate approved change.
- `worker` gets `DATABASE_URL=postgres://radar@127.0.0.1:5433/radar` with no
  password, and `POSTGRES_PASSWORD_FILE`. `databaseUrl` in
  `worker/src/lib/db.ts` reads the file once, when the first pool is created. It
  removes one trailing newline and puts the password into the URL. It fails,
  naming the variable and never the value, when the file is missing or empty,
  when `POSTGRES_PASSWORD` and `POSTGRES_PASSWORD_FILE` are both set, or when
  `DATABASE_URL` already has a password. Without `POSTGRES_PASSWORD_FILE` it uses
  `DATABASE_URL` as given, so local runs and CI keep a password in the URL.
- When the env file has no `POSTGRES_PASSWORD`, `docker compose config` still
  succeeds, but `docker compose run` and `up` refuse: `environment variable
  "POSTGRES_PASSWORD" required by secret ... is not set`.

`docker-compose.yaml` is hash-pinned by `compose_sha256` in the root-owned
`/etc/policai-deploy/config.json`. A change to it needs that value updated in the
same reviewed window as its deploy (`ops/host/README.txt`, UPGRADE CONTRACT,
step b).
