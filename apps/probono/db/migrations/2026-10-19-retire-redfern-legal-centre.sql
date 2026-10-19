-- Retire Redfern Legal Centre RSS, approved 2026-10-19 (GitHub #390).
-- Idempotent; keep item and ingest_run history.
--
-- https://rlc.org.au/rss.xml returns Cloudflare HTTP 403 (cf-mitigated:
-- challenge, "Just a moment...") for the collector identity
-- Policai/1.0 (+https://policai.org), for ProBonoRadar/1.0
-- (+https://a2j.policai.org), and for the rss-parser User-Agent the worker
-- actually sends. Do not disguise the user agent or solve the challenge.
-- Editorial retirement: active = false so the source is Retired on
-- /health and stops repeating as Failed. The feed document may still
-- exist for other clients; this records refusal of our identity, not a
-- dead URL. Tenants' Union of NSW remains active and unchanged.
BEGIN;

UPDATE sources SET active = false WHERE url = 'https://rlc.org.au/rss.xml';

COMMIT;
