# Pro Bono Radar — Design

Date: 2026-08-07
Status: Approved by Daniel (in-session), pending spec review

## Purpose

Automate the monitoring part of Daniel's role as a Technology and Innovation lawyer at Gilbert + Tobin: surface developments across the Australian Pro Bono sector so he can (a) brief colleagues and partners, (b) spot opportunities G+T's pro bono practice could act on, and (c) track the sector over time.

Positioning: personal radar first, publishable later. Version 1 is private (Tailscale-only). The data model and pipeline are designed so that opening the dashboard to the sector is a publishing decision (Cloudflare Tunnel + editorial pass), not a rebuild.

## Content scope

Four streams, all in v1:

1. **News & announcements** — sector news, program announcements, appointments, awards.
2. **Law reform & policy** — inquiries, consultations, submissions, legislation affecting access to justice and the community legal sector.
3. **Funding & grants** — grant rounds, government funding (e.g. NLAP), philanthropic funding affecting CLCs and pro bono demand.
4. **Tech & innovation in justice** — legal tech for access to justice, AI in legal aid, court digitisation (overlap with the T+I practice).

Initial source list (~15–25, held in a config table, editable without redeploy): Australian Pro Bono Centre, Justice Connect, Community Legal Centres Australia, Pro Bono Australia news, Attorney-General's Department, ALRC and state law reform commissions, consultation/funding pages (e.g. NLAP), legal-tech-for-justice outlets, major firm pro bono pages. Exact list finalised during implementation.

## Architecture

One repo. Deployed to `/home/l0cka/services/probono-radar/` on Argus, following the existing per-service docker-compose convention. Four units, each talking only to the database:

| Unit | What it does | Runs |
|---|---|---|
| Ingest worker | Fetch sources, dedupe, enrich via Claude API, write items | systemd user timer, daily ~06:00 AEST |
| Postgres | Storage (Docker container, volume-backed) | always |
| Dashboard | Next.js: filterable feed, search, per-stream history, deadline list | always, bound to `127.0.0.1`, reached over Tailscale |
| Digest job | Compile week's items, send email | systemd user timer, Sunday 18:00 AEST |

The dashboard never scrapes; the ingester never renders. Chat-over-data and public access are v2+ readers over the same database.

### Ingestion

- RSS/Atom where the source offers it; everything else through the self-hosted Firecrawl instance already running on Argus.
- Dedupe by canonical URL and content hash.
- Per-source failure isolation: one dead source never blocks the run.

### Enrichment (Claude API)

One call pipeline per new item:

- Classify into the four streams (Haiku).
- Two-sentence briefing blurb, written to be pasteable into an email to a partner (Sonnet).
- Opportunity score: could G+T's pro bono / T+I practice act on this? (flag + one-line reason).
- Entity extraction: organisations, deadlines, dollar amounts — feeds the track-over-time views.

Estimated cost $5–15/month at this volume. Retries with backoff; an item that fails enrichment stays visible unclassified rather than disappearing.

## Data model

Five tables:

- `sources` — name, url, fetch method (rss | firecrawl), stream hint, active flag.
- `items` — url, title, published_at, source_id, stream, blurb, opportunity_score, opportunity_reason, entities (jsonb), excerpt, content_hash, created_at. **Excerpt only — full text is never republished**, which keeps the eventual public version clean on copyright.
- `ingest_runs` — per-source, per-run success/failure log with error detail.
- `digests` — sent digests (period, item ids, sent_at) so history is reconstructable.
- `tags` — manual tagging for Daniel's own organisation of items.

History kept indefinitely (disk is not a constraint on Argus).

## Outputs

**Weekly digest email** (Sunday 18:00 AEST, via Gmail SMTP with an app password):

- Opportunity-flagged items on top.
- New items grouped by stream.
- Consultation/grant deadlines called out.
- Footer listing any sources that failed during the week — silent failure is impossible.
- Links into the dashboard.

**Dashboard** (Next.js): filterable feed, full-text search, per-stream history, upcoming-deadline list. No auth in v1 — access control is Tailscale membership.

## Deployment

- Argus path: `/home/l0cka/services/probono-radar/` with `docker-compose.yaml` (convention: firecrawl et al.).
- Dashboard port bound to `127.0.0.1`, reached via Tailscale (`100.87.255.67`).
- Secrets (Claude API key, Gmail app password) in `.env` on Argus, never committed.
- Going public later: add a Cloudflare Tunnel (established Argus pattern) + editorial pass. No architectural change.

## Error handling

- Source failures land in `ingest_runs` and surface in the digest footer.
- Claude API calls retry with exponential backoff; enrichment failure leaves the item visible but unclassified.
- Digest job aborts loudly (non-zero exit → journald) rather than sending a partial email silently.

## Testing

- Fixture-based parser tests (canned RSS/HTML per source type).
- Pipeline integration test on fixtures: fetch → dedupe → enrich (mocked Claude) → stored item.
- Digest snapshot test: known items in, expected email HTML out.
- Manual smoke test on Argus before enabling timers.

## Out of scope for v1 (explicit)

- Chat-over-data (v2, once the database has months of history).
- Public access / sector-facing publishing (v2, needs editorial standards and any G+T sign-off Daniel deems necessary).
- Real-time alerts (revisit after the weekly rhythm proves out).
- Auth (Tailscale is the boundary in v1).
