INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint) VALUES
  ('ALRC News',                     'https://www.alrc.gov.au/feed/',                'rss',       NULL,                    'law_reform'),
  ('Artificial Lawyer',             'https://www.artificiallawyer.com/feed/',       'rss',       NULL,                    'tech_justice'),
  ('Australian Pro Bono Centre',    'https://www.probonocentre.org.au/feed/',       'rss',       NULL,                    'news'),
  ('Justice Connect',               'https://justiceconnect.org.au/feed/',          'rss',       NULL,                    'news'),
  ('CLCs Australia',                'https://clcs.org.au/feed/',                    'rss',       NULL,                    'news'),
  ('Victorian Law Reform Commission','https://www.lawreform.vic.gov.au/feed/',      'rss',       NULL,                    'law_reform'),
  ('AGD Consultations',             'https://consultations.ag.gov.au/',             'firecrawl', 'consultations\.ag\.gov\.au/[a-z0-9-]+/[a-z0-9-]+/$', 'law_reform'),
  ('NSW Law Reform Commission',     'https://lawreform.nsw.gov.au/',                'firecrawl', 'lawreform\.nsw\.gov\.au/.+/projects/.+\.html', 'law_reform'),
  ('National Legal Aid',            'https://nationallegalaid.org.au/news',         'firecrawl', 'nationallegalaid\.org\.au/news/.+', 'funding'),
  ('Law Council Media',             'https://lawcouncil.au/media/news',             'firecrawl', 'lawcouncil\.au/media/news/.+', 'news'),
  ('GrantConnect Forecasts',        'https://www.grants.gov.au/Go/List',            'firecrawl', 'grants\.gov\.au/Go/Show', 'funding')
ON CONFLICT (url) DO NOTHING;

-- Pro Bono News (probonoaustralia.com.au) ceased publication; the domain is now
-- a Shopify storefront with no news feed. Seeded inactive pending a replacement
-- sector-news source.
INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint, active) VALUES
  ('Pro Bono Australia', 'https://probonoaustralia.com.au/feed/', 'rss', NULL, 'news', false)
ON CONFLICT (url) DO UPDATE SET active = false;
