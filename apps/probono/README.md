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
(cd apps/probono/dashboard && npx tsc --noEmit --incremental false)
npm --prefix apps/probono/dashboard run build
npm --prefix apps/probono/worker test
npm --prefix apps/probono/worker run test:security
```

Builds require the child dependencies and appropriate non-production configuration;
integration tests may require an isolated test database. Do not point tests at
production. `db/` holds schema, seeds and migrations, not the live database.
Postgres state and backups remain external to Git and application releases.
Secrets, environment files and SMTP credentials must remain outside Git. Never
copy live database contents or secret files into this subtree.

Spec: docs/superpowers/specs/2026-08-07-probono-radar-design.md

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

## Production boundary and planned cutover (Argus)

The existing runtime checkout is
`/home/l0cka/Work/Argus/services/probono-radar/src`; importing source does not
change the running services. Verify unit working directories before operational work.

**Planned, not active until an explicitly approved cutover:** deploy the child at
`/var/lib/probono-radar/app/apps/probono`. Pro Bono must have its own release,
rollback and health verification, separate from Policai. Preserve the existing
Postgres volume, external backups and secret configuration across releases.
Do not use the old `ops/deploy.sh` rsync deployment (`rsync --delete`); it is not
the amalgamated release procedure. Historical runbooks/unit paths are not proof
that cutover has happened.

Ingest and enrichment use `probono-ingest.timer` and `probono-enrich.timer`;
backups remain a separate operational responsibility. Preserve masks on both
`probono-digest.service` and `probono-digest.timer`. A schedule in `ops/` does not
authorise email delivery: unmasking requires explicit approval and verified SMTP
configuration. Schema changes, timer changes, deployment and live writes also
require separate approval. See [AGENTS.md](./AGENTS.md) for child-specific rules.
