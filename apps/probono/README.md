# Pro Bono Radar

Monitors the Australian Pro Bono sector with a Postgres-backed dashboard and
agent-driven collection/enrichment workers. Public dashboard: https://a2j.policai.org.
Digest delivery is approval-gated; preserve the digest service and timer masks.

## Source, package and data boundaries

Canonical source is `apps/probono` in the Policai repository. Policai remains the
root application; this child is an independent application, not part of its
Git-backed JSON database or ISR deployment lane. The imported Pro Bono history
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
variable, so a sending run has to supply it deliberately. A period is one Sydney
calendar week by `digests.period_end`; the digest claims that week in a locked
transaction before sending and refuses when a row already exists, releasing the
claim if the send fails. Setting the variable is the approval step and still
needs the explicit approval above.

`worker/src/fetch-all.ts` exits explicitly once its run summary is printed and
the pool is closed. `rss-parser` leaves the response unread when a feed answers
with a non-2xx status, so that socket keeps Node alive; without the explicit
exit one blocked feed holds the ingest container open until the host dispatcher
times out, and a worker left running blocks later deployments and workers.
