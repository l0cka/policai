-- Retire two dead feeds, approved 2026-10-06. Idempotent; keep item history.
-- Evidence: reports/2026-10-06-policai-factory/lane-a2j-sources-triage.md
-- in the Argus workspace, sections 1 and 4 (observed 2026-10-06).
-- https://fnaafv.org.au/rss.xml: HTTP 404; homepage HTTP 200, with no
-- advertised feed and the alternative feed paths checked also returning 404.
-- https://www.wheatbeltclc.com.au/blog-feed.xml: host fails DNS resolution;
-- the apex redirects to the same dead www host. The configured feed is gone.
-- Redfern Legal Centre and Tenants' Union of NSW remain active and unchanged:
-- access refusal is not evidence of a dead feed and must not be bypassed.
BEGIN;

UPDATE sources SET active = false WHERE url IN (
  'https://fnaafv.org.au/rss.xml',
  'https://www.wheatbeltclc.com.au/blog-feed.xml'
);

COMMIT;
