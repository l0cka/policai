-- QLRC's news pages render only section indexes in markdown — item links
-- never appear, at /news or /news/releases. Uncrawlable today; deactivate
-- both rows. Idempotent.
UPDATE sources SET active = false
WHERE url IN ('https://www.qlrc.qld.gov.au/news/releases', 'https://www.qlrc.qld.gov.au/news');
