INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint) VALUES
  ('ALRC News',                     'https://www.alrc.gov.au/feed/',                'rss',       NULL,                    'law_reform'),
  ('Artificial Lawyer',             'https://www.artificiallawyer.com/feed/',       'rss',       NULL,                    'tech_justice'),
  ('Australian Pro Bono Centre',    'https://www.probonocentre.org.au/feed/',       'rss',       NULL,                    'news'),
  ('Justice Connect',               'https://justiceconnect.org.au/feed/',          'rss',       NULL,                    'news'),
  ('Victorian Law Reform Commission','https://www.lawreform.vic.gov.au/feed/',      'rss',       NULL,                    'law_reform'),
  ('AGD Consultations',             'https://consultations.ag.gov.au/',             'firecrawl', 'consultations\.ag\.gov\.au/[a-z0-9-]+/[a-z0-9-]+/$', 'law_reform'),
  ('NSW Law Reform Commission',     'https://lawreform.nsw.gov.au/',                'firecrawl', 'lawreform\.nsw\.gov\.au/.+/projects/.+\.html', 'law_reform'),
  ('National Legal Aid',            'https://nationallegalaid.org.au/news',         'firecrawl', 'nationallegalaid\.org\.au/news/.+', 'funding'),
  ('Law Council Media',             'https://lawcouncil.au/media/news',             'firecrawl', 'lawcouncil\.au/media/news/.+', 'news'),
  -- 2026-08-07 sector-wide expansion. RSS feeds verified live; scrape patterns
  -- derived from each site's rendered listing (probe results, not guesses).
  ('Community Legal WA',            'https://communitylegalwa.org.au/feed/',        'rss',       NULL,                    'news'),
  ('NATSILS',                       'https://www.natsils.org.au/feed/',             'rss',       NULL,                    'news'),
  ('Victorian Aboriginal Legal Service','https://www.vals.org.au/news/feed/',       'rss',       NULL,                    'news'),
  ('NAAJA',                         'https://www.naaja.org.au/feed/',               'rss',       NULL,                    'news'),
  ('Aboriginal Legal Service WA',   'https://als.org.au/feed/',                     'rss',       NULL,                    'news'),
  ('ATSILS Queensland',             'https://atsils.org.au/news/feed/',             'rss',       NULL,                    'news'),
  ('Human Rights Law Centre',       'https://www.hrlc.org.au/news/feed/',           'rss',       NULL,                    'law_reform'),
  ('Justice and Equity Centre',     'https://jec.org.au/feed/',                     'rss',       NULL,                    'law_reform'),
  ('Economic Justice Australia',    'https://www.ejaustralia.org.au/feed/',         'rss',       NULL,                    'law_reform'),
  ('Womens Legal Services Australia','https://wlsa.org.au/feed/',                   'rss',       NULL,                    'news'),
  ('National Justice Project',      'https://www.justice.org.au/feed/',             'rss',       NULL,                    'news'),
  ('Refugee Legal',                 'https://refugeelegal.org.au/feed/',            'rss',       NULL,                    'news'),
  ('Philanthropy Australia',        'https://www.philanthropy.org.au/feed/',        'rss',       NULL,                    'funding'),
  ('Legal Aid NSW',                 'https://www.legalaid.nsw.gov.au/about-us/news/media-releases', 'firecrawl', 'legalaid\.nsw\.gov\.au/about-us/news/(media-releases|other-news)/.+', 'news'),
  ('Legal Aid Queensland',          'https://www.legalaid.qld.gov.au/Listings/Media-releases', 'firecrawl', 'legalaid\.qld\.gov\.au/(Listings/Media-releases|For-lawyers/Announcements|About-us/Newsroom)/.+', 'news'),
  ('Legal Aid WA',                  'https://www.legalaid.wa.gov.au/news',          'firecrawl', 'legalaid\.wa\.gov\.au/news/.+', 'news'),
  ('Legal Services Commission SA',  'https://lsc.sa.gov.au/',                       'firecrawl', 'lsc\.sa\.gov\.au/cb_pages/news/.+', 'news'),
  ('Queensland Law Reform Commission','https://www.qlrc.qld.gov.au/news',           'firecrawl', 'qlrc\.qld\.gov\.au/news/\?external-uuid=.+', 'law_reform'),
  ('Community Legal Centres NSW',   'https://www.clcnsw.org.au/news',               'firecrawl', 'clcnsw\.org\.au/index\.php/.+', 'news'),
  ('Federation of Community Legal Centres VIC','https://www.fclc.org.au/news',      'firecrawl', 'fclc\.org\.au/[a-z0-9]+(_[a-z0-9]+)+$', 'news'),
  ('Community Legal Centres Queensland','https://communitylegalqld.org.au/news/latest-news/', 'firecrawl', 'communitylegalqld\.org\.au/news/.+/.+', 'news'),
  ('Aboriginal Legal Service NSW/ACT','https://www.alsnswact.org.au/news',          'firecrawl', 'alsnswact\.org\.au/[a-z0-9]+(_[a-z0-9]+)+$', 'news'),
  ('Grata Fund',                    'https://www.gratafund.org.au/media',           'firecrawl', 'gratafund\.org\.au/[a-z0-9]+(_[a-z0-9]+)+$', 'law_reform'),
  ('Refugee Advice and Casework Service','https://www.racs.org.au/news',            'firecrawl', 'racs\.org\.au/news/(?!category/|tag/).+', 'news'),
  ('Paul Ramsay Foundation',        'https://www.paulramsayfoundation.org.au/',     'firecrawl', 'paulramsayfoundation\.org\.au/news-resources/.+', 'funding'),
  ('Victorian Legal Services Board','https://lsbc.vic.gov.au/news-updates',         'firecrawl', 'lsbc\.vic\.gov\.au/news-updates/news/.+', 'funding'),
  ('Law and Justice Foundation NSW','https://lawfoundation.net.au/',                'firecrawl', 'lawfoundation\.net\.au/news/.+', 'funding'),
  ('Allens',                        'https://www.allens.com.au/insights-news/',     'firecrawl', 'allens\.com\.au/insights-news/insights/.+', 'news'),
  ('MinterEllison',                 'https://www.minterellison.com/media-centre',   'firecrawl', 'minterellison\.com/articles/.+', 'news'),
  ('Maddocks',                      'https://www.maddocks.com.au/insights',         'firecrawl', 'maddocks\.com\.au/insights/.+', 'news'),
  ('Ashurst',                       'https://www.ashurst.com/en/insights/all-insights/', 'firecrawl', 'ashurst\.com/en/insights/(?!all-insights).+', 'news')
ON CONFLICT (url) DO NOTHING;

-- Probed 2026-08-07 and NOT seeded — no workable ingestion path today:
-- Victoria Legal Aid, Legal Aid ACT, NT Legal Aid, Tasmania Legal Aid
--   (news listings render client-side with no crawlable item links);
-- Law Reform Commission of WA (publishes into whole-of-government wa.gov.au
--   with no scoped listing); SA Law Reform Institute (buried in uni site);
-- Tasmania Law Reform Institute (page 404s); Youth Law Australia,
-- Community Legal Centres SA (no item links on news/publications pages);
-- Clayton Utz, Hall & Wilcox, HSF Kramer, KWM, Corrs (JS listings expose
-- no article links even rendered).

-- Seeded inactive, pending a workable ingestion path:
-- * Pro Bono Australia: Pro Bono News ceased publication; the domain is now a
--   Shopify storefront with no news feed. Needs a replacement sector-news source.
-- * CLCs Australia: WordPress feeds exist but contain zero items, and the
--   news/media pages render their listings client-side with no crawlable links.
-- * GrantConnect: Angular app; grant rows carry no hrefs in rendered markdown
--   and the RSS endpoint is 403. Needs a custom fetcher (API or paginated HTML).
INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint, active) VALUES
  ('Pro Bono Australia',    'https://probonoaustralia.com.au/feed/', 'rss',       NULL,                   'news',    false),
  ('CLCs Australia',        'https://clcs.org.au/feed/',             'rss',       NULL,                   'news',    false),
  ('GrantConnect Forecasts','https://www.grants.gov.au/Go/List',     'firecrawl', 'grants\.gov\.au/Go/Show', 'funding', false)
ON CONFLICT (url) DO UPDATE SET active = false;
