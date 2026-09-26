-- Source terms-of-use pass, 2026-09-26. Findings: docs/source-terms.md.
-- Run after db/schema.sql (which adds sources.allow_excerpt and the excerpt
-- trigger). Idempotent.
BEGIN;

-- Ashurst's terms forbid scraping ("data mining, robots, or similar data
-- gathering or extraction methods"). The other five answer every automated
-- request with a bot challenge, so they yield nothing and their terms could not
-- be read. Existing items stay; no new fetches.
UPDATE sources SET active = false WHERE url IN (
  'https://www.ashurst.com/en/insights/all-insights/',
  'https://www.fclc.org.au/news',
  'https://www.alsnswact.org.au/news',
  'https://www.gratafund.org.au/media',
  'https://www.maddocks.com.au/insights',
  'https://lawfoundation.net.au/'
);

-- Terms forbid reproducing content on another site, or reserve all rights with
-- no permission to reproduce: headline, link and date only.
UPDATE sources SET allow_excerpt = false WHERE url IN (
  'https://www.ashurst.com/en/insights/all-insights/',
  'https://www.allens.com.au/insights-news/',
  'https://www.minterellison.com/media-centre',
  'https://www.legalaid.qld.gov.au/Listings/Media-releases',
  'https://lawcouncil.au/media/news',
  'https://lawcouncil.au/media'
);

-- Remove excerpts already stored for those sources. The trigger only guards
-- new writes.
UPDATE items SET excerpt = NULL
  WHERE excerpt IS NOT NULL
    AND source_id IN (SELECT id FROM sources WHERE NOT allow_excerpt);

COMMIT;
