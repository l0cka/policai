INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint) VALUES
  ('ALRC News',                     'https://www.alrc.gov.au/feed/',                'rss',       NULL,                    'law_reform'),
  ('Artificial Lawyer',             'https://www.artificiallawyer.com/feed/',       'rss',       NULL,                    'tech_justice'),
  ('Australian Pro Bono Centre',    'https://probonocentre.org.au/news/',           'firecrawl', 'probonocentre\.org\.au/(?!news/?$)', 'news'),
  ('Justice Connect',               'https://justiceconnect.org.au/about-us/news/', 'firecrawl', 'justiceconnect\.org\.au/(news|stories)/.+', 'news'),
  ('CLCs Australia',                'https://clcs.org.au/news',                     'firecrawl', 'clcs\.org\.au/.+',      'news'),
  ('AGD Consultations',             'https://consultations.ag.gov.au/',             'firecrawl', 'consultations\.ag\.gov\.au/.+', 'law_reform'),
  ('Victorian Law Reform Commission','https://www.lawreform.vic.gov.au/news/',      'firecrawl', 'lawreform\.vic\.gov\.au/.+', 'law_reform'),
  ('NSW Law Reform Commission',     'https://lawreform.nsw.gov.au/',                'firecrawl', 'lawreform\.nsw\.gov\.au/.+', 'law_reform'),
  ('National Legal Aid',            'https://www.nationallegalaid.org/news/',       'firecrawl', 'nationallegalaid\.org/.+', 'funding'),
  ('Law Council Media',             'https://lawcouncil.au/media',                  'firecrawl', 'lawcouncil\.au/media/.+', 'news'),
  ('GrantConnect Forecasts',        'https://www.grants.gov.au/Go/List',            'firecrawl', 'grants\.gov\.au/Go/.+', 'funding')
ON CONFLICT (url) DO NOTHING;

-- Pro Bono News (probonoaustralia.com.au) ceased publication; the domain is now
-- a Shopify storefront with no news feed. Seeded inactive pending a replacement
-- sector-news source.
INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint, active) VALUES
  ('Pro Bono Australia', 'https://probonoaustralia.com.au/feed/', 'rss', NULL, 'news', false)
ON CONFLICT (url) DO UPDATE SET active = false;
