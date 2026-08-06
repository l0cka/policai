-- Pro Bono Radar schema. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS sources (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL UNIQUE,
  fetch_method      TEXT NOT NULL CHECK (fetch_method IN ('rss', 'firecrawl')),
  -- regex a listing-page link must match to count as an item (firecrawl sources)
  item_link_pattern TEXT,
  stream_hint       TEXT CHECK (stream_hint IN ('news', 'law_reform', 'funding', 'tech_justice')),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id                 SERIAL PRIMARY KEY,
  source_id          INTEGER NOT NULL REFERENCES sources(id),
  url                TEXT NOT NULL,
  canonical_url      TEXT NOT NULL UNIQUE,        -- primary dedupe key
  title              TEXT NOT NULL,
  published_at       TIMESTAMPTZ,
  excerpt            TEXT CHECK (char_length(excerpt) <= 700),
  content_hash       TEXT,                        -- sha256(title + excerpt), secondary dedupe
  stream             TEXT CHECK (stream IN ('news', 'law_reform', 'funding', 'tech_justice')),
  blurb              TEXT,
  opportunity        BOOLEAN NOT NULL DEFAULT FALSE,
  opportunity_reason TEXT,
  entities           JSONB,                       -- {organisations:[], deadlines:[{date,label}], amounts:[]}
  enriched_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  search             TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(blurb, ''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS items_search_idx ON items USING GIN (search);
CREATE INDEX IF NOT EXISTS items_stream_idx ON items (stream);
CREATE INDEX IF NOT EXISTS items_created_idx ON items (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS items_content_hash_idx ON items (content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest_runs (
  id             SERIAL PRIMARY KEY,
  run_started_at TIMESTAMPTZ NOT NULL,
  source_id      INTEGER NOT NULL REFERENCES sources(id),
  status         TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
  items_found    INTEGER NOT NULL DEFAULT 0,
  items_new      INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingest_runs_source_idx ON ingest_runs (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS digests (
  id           SERIAL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  item_ids     INTEGER[] NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
