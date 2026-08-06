-- Source quality pass, 2026-08-07. db/seed.sql (applied by deploy) inserts the
-- corrected sources as new rows where the URL changed; this migration
-- deactivates the superseded rows, tightens patterns on rows whose URL kept,
-- and purges items ingested under the old loose patterns. Idempotent.
BEGIN;

-- Superseded by RSS-feed or corrected-URL rows now in seed.sql.
UPDATE sources SET active = false WHERE url IN (
  'https://probonocentre.org.au/news/',
  'https://justiceconnect.org.au/about-us/news/',
  'https://clcs.org.au/news',
  'https://www.lawreform.vic.gov.au/news/',
  'https://www.nationallegalaid.org/news/',
  'https://lawcouncil.au/media'
);

-- URL unchanged; anchor the pattern to real article paths.
UPDATE sources SET item_link_pattern = 'consultations\.ag\.gov\.au/[a-z0-9-]+/[a-z0-9-]+/$'
  WHERE url = 'https://consultations.ag.gov.au/';
UPDATE sources SET item_link_pattern = 'lawreform\.nsw\.gov\.au/.+/projects/.+\.html'
  WHERE url = 'https://lawreform.nsw.gov.au/';
UPDATE sources SET item_link_pattern = 'grants\.gov\.au/Go/Show'
  WHERE url = 'https://www.grants.gov.au/Go/List';

-- Remove unenriched items ingested under the old loose patterns (nav links,
-- anchors, a PNG). Anything legitimate among them is re-ingested by the next
-- fetch run under the corrected config; enriched items are untouched.
DELETE FROM items WHERE stream IS NULL;

-- Round 2 follow-ups (see seed.sql comments): CLCs' feeds are empty and its
-- listings are not crawlable; GrantConnect's Angular list exposes no hrefs.
UPDATE sources SET active = false
  WHERE url IN ('https://clcs.org.au/feed/', 'https://www.grants.gov.au/Go/List');

-- Purge items saved from probonocentre.org.au's malformed feed <link> values
-- ("http://voco-11-…"); the guid fallback re-ingests them with working URLs.
DELETE FROM items WHERE url LIKE 'http://voco-%' AND stream IS NULL;

COMMIT;
