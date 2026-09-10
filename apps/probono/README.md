# Pro Bono Radar

Monitors the Australian Pro Bono sector. Daily agent-driven ingest into
Postgres, Tailscale-private dashboard, Sunday 18:00 AEST digest email.

Spec: docs/superpowers/specs/2026-08-07-probono-radar-design.md

## Local dev
1. `cp .env.example .env` and set POSTGRES_PASSWORD.
2. `docker compose up -d db`
3. Apply schema: see below.
4. Worker: `cd worker && $NODEBIN/npm install && $NODEBIN/npx tsx src/fetch-all.ts`
5. Dashboard: `cd dashboard && $NODEBIN/npm install && $NODEBIN/npm run dev`

Apply schema/seed:
`docker compose exec -T db psql -U radar -d radar < db/schema.sql`
`docker compose exec -T db psql -U radar -d radar < db/seed.sql`

## Production (Argus)
`/home/l0cka/services/probono-radar/src/`, deployed by `ops/deploy.sh`.
Ingest: systemd user timer `probono-ingest.timer` (daily 06:00 Sydney).
Digest: `probono-digest.timer` (Sun 18:00 Sydney). See ops/.
