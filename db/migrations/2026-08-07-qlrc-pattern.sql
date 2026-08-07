-- QLRC news items live behind query-string URLs (/news/?external-uuid=<uuid>),
-- not path slugs; the /news/releases page has no item links. seed.sql (applied
-- by deploy) inserts the corrected row; deactivate the superseded one.
-- Idempotent.
UPDATE sources SET active = false
WHERE url = 'https://www.qlrc.qld.gov.au/news/releases';
