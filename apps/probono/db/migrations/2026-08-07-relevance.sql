-- Relevance gate, 2026-08-07. Items the enrichment agent judges to have no
-- bearing on the pro bono / access-to-justice sector are kept but excluded
-- from the feed and digest (auditable via the feed's Filtered toggle).
-- Idempotent.
BEGIN;

ALTER TABLE items ADD COLUMN IF NOT EXISTS relevant BOOLEAN NOT NULL DEFAULT TRUE;

-- Law Council's "Meet [name] independent childrens lawyer" practitioner
-- profile series: awareness content, not sector developments.
UPDATE items SET relevant = false
  WHERE url ~ 'meet-.*-independent-childrens-lawyer';

COMMIT;
