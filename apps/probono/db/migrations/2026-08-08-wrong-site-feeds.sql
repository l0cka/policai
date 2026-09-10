-- Source audit, 2026-08-08. Four active sources were pointed at a different
-- organisation's website than the one they are named for, and one core source
-- was pointed at an empty feed. Idempotent.
--
-- These four accounted for 584 of the 1,456 items the enrichment agent marked
-- irrelevant. The remaining rejections are a separate problem: the agent was
-- stamping one source-level verdict across every item from a source, which
-- RUNBOOK.md now forbids. Do NOT deactivate the other zero-yield sources —
-- most of them publish genuine access-to-justice material that was wrongly
-- rejected, and re-enrichment is expected to bring them back.
BEGIN;

-- Whole-university and whole-council feeds, plus a philanthropic funder whose
-- output is overwhelmingly arts/science/health. Each verified by reading the
-- titles actually ingested.
UPDATE sources SET active = false WHERE url IN (
  'https://umsu.unimelb.edu.au/news/rss/6013/',  -- entire student union
  'https://www.curtin.edu.au/news/feed/',        -- entire university
  'https://www.fremantle.wa.gov.au/feed/',       -- City of Fremantle council
  'https://www.ianpotter.org.au/news/rss'        -- general philanthropy
);

-- ALRC is a core law-reform source that has produced nothing since launch:
-- /feed/ returns valid RSS with zero entries, /news/feed/ carries the items.
-- seed.sql now holds the corrected URL; retire the empty one.
UPDATE sources SET active = false WHERE url = 'https://www.alrc.gov.au/feed/';

COMMIT;
