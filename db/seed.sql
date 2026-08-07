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
-- no article links even rendered); Queensland Law Reform Commission (news
-- pages render only section indexes — item links never appear in markdown).

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

-- 2026-08-07 sector-wide source expansion.
-- Every feed below responded to a live probe and parsed with at least two
-- entries; none is a guessed URL. Organisations come from the sector map
-- (docs/a2j-sector-research.json). Regenerate the probe rather than editing
-- these by hand.
INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint) VALUES
  ('RMIT Centre for Innovative Justice', 'https://cij.org.au/feed/', 'rss', NULL, 'news'),
  ('UQ Pro Bono Centre', 'https://law.uq.edu.au/rss.xml', 'rss', NULL, 'news'),
  ('ADA Law', 'https://adalaw.com.au/feed/', 'rss', NULL, 'news'),
  ('AED Legal Centre', 'https://aed.org.au/feed/', 'rss', NULL, 'news'),
  ('ARC Justice', 'https://arcjustice.org.au/feed/', 'rss', NULL, 'news'),
  ('Allied Justice', 'https://www.alliedjustice.org.au/feed/rss2', 'rss', NULL, 'news'),
  ('Arts Law Centre of Australia', 'https://www.artslaw.com.au/feed/', 'rss', NULL, 'news'),
  ('Asylum Seeker Resource Centre', 'https://asrc.org.au/feed/', 'rss', NULL, 'news'),
  ('Barwon Community Legal Service', 'https://www.barwoncommunitylegal.org.au/feed/', 'rss', NULL, 'news'),
  ('Basic Rights Queensland', 'https://brq.org.au/feed/', 'rss', NULL, 'news'),
  ('Brisbane North Community Legal Centre', 'https://www.northsideconnect.org.au/feed/', 'rss', NULL, 'news'),
  ('Cairns Community Legal Centre', 'https://www.cclc.org.au/feed/', 'rss', NULL, 'news'),
  ('Circle Green Community Legal', 'https://circlegreen.org.au/feed/', 'rss', NULL, 'news'),
  ('Citizens Advice Bureau of WA', 'https://cabwa.com.au/feed/', 'rss', NULL, 'news'),
  ('Community Justice Services SA', 'https://www.communityjusticesa.org.au/feed/', 'rss', NULL, 'news'),
  ('Consumer Action Law Centre', 'https://consumeraction.org.au/feed/', 'rss', NULL, 'news'),
  ('Consumer Credit Legal Service WA', 'https://cclswa.org.au/feed/', 'rss', NULL, 'news'),
  ('Deadly Connections Community & Justice Services', 'https://deadlyconnections.org.au/feed/', 'rss', NULL, 'news'),
  ('Disability Discrimination Legal Service', 'https://ddls.org.au/feed/', 'rss', NULL, 'news'),
  ('Emma House Legal Program', 'https://www.emmahouse.org.au/feed/', 'rss', NULL, 'news'),
  ('Environmental Justice Australia', 'https://envirojustice.org.au/feed/', 'rss', NULL, 'news'),
  ('Financial Rights Legal Centre', 'https://financialrights.org.au/feed/', 'rss', NULL, 'news'),
  ('Fitzroy Legal Service', 'https://fls.org.au/feed/', 'rss', NULL, 'news'),
  ('Fremantle Community Legal Centre', 'https://www.fremantle.wa.gov.au/feed/', 'rss', NULL, 'news'),
  ('Gold Coast Community Legal Centre', 'https://www.gcclc.org.au/feed/', 'rss', NULL, 'news'),
  ('Hobart Community Legal Service', 'https://hobartlegal.org.au/news/feed/', 'rss', NULL, 'news'),
  ('Hume Riverina Community Legal Service', 'https://hrcls.org.au/feed/', 'rss', NULL, 'news'),
  ('Illawarra Legal Centre', 'https://illawarralegalcentre.org.au/feed/', 'rss', NULL, 'news'),
  ('Immigration Advice and Rights Centre', 'https://iarc.org.au/feed/', 'rss', NULL, 'news'),
  ('Intellectual Disability Rights Service', 'https://idrs.org.au/feed/', 'rss', NULL, 'news'),
  ('JobWatch', 'https://jobwatch.org.au/feed/', 'rss', NULL, 'news'),
  ('John Curtin Law Clinic', 'https://www.curtin.edu.au/news/feed/', 'rss', NULL, 'news'),
  ('Just Reinvest NSW', 'https://www.justreinvest.org.au/feed/', 'rss', NULL, 'news'),
  ('Katherine Women''s Information and Legal Service', 'https://www.kwils.com.au/feed/rss2', 'rss', NULL, 'news'),
  ('LGBTI Legal Service', 'https://lgbtilegalservice.org.au/feed/', 'rss', NULL, 'news'),
  ('Law and Advocacy Centre for Women', 'https://lacw.com.au/feed/', 'rss', NULL, 'news'),
  ('Mackay Regional Community Legal Centre', 'https://mrclc.com.au/feed/', 'rss', NULL, 'news'),
  ('Marrickville Legal Centre', 'https://www.mlc.org.au/feed/', 'rss', NULL, 'news'),
  ('Mid North Coast Legal Centre', 'https://mnclegal.org.au/feed/', 'rss', NULL, 'news'),
  ('Midlas', 'https://www.midlas.org.au/feed/', 'rss', NULL, 'news'),
  ('Moonee Valley Legal Service', 'https://mvls.org.au/feed/', 'rss', NULL, 'news'),
  ('My Community Legal', 'https://www.mycommunitylegal.org.au/feed/', 'rss', NULL, 'news'),
  ('NT Working Women''s Centre', 'https://www.ntwwc.com.au/feed/rss2', 'rss', NULL, 'news'),
  ('North West Community Legal Centre', 'https://www.nwclc.org.au/feed/', 'rss', NULL, 'news'),
  ('Peel Community Legal Services', 'https://www.peelcls.com.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('Pine Rivers Community Legal Service', 'https://encircle.org.au/feed/', 'rss', NULL, 'news'),
  ('Prisoners'' Legal Service', 'https://plsqld.com/feed/', 'rss', NULL, 'news'),
  ('Queensland Advocacy for Inclusion', 'https://qai.org.au/feed/', 'rss', NULL, 'news'),
  ('Redfern Legal Centre', 'https://rlc.org.au/rss.xml', 'rss', NULL, 'news'),
  ('Ruah Legal Services', 'https://ruahlegal.org.au/feed/', 'rss', NULL, 'news'),
  ('Seniors Rights Service', 'https://seniorsrightsservice.org.au/feed/', 'rss', NULL, 'news'),
  ('Seniors Rights Victoria', 'https://seniorsrights.org.au/feed/', 'rss', NULL, 'news'),
  ('South-East Monash Legal Service', 'https://www.smls.com.au/feed/', 'rss', NULL, 'news'),
  ('Southport Community Legal Service', 'https://www.southportcls.com.au/blog/feed/', 'rss', NULL, 'news'),
  ('Southside Justice', 'https://southsidejustice.org.au/feed/', 'rss', NULL, 'news'),
  ('Sussex Street Community Law Service', 'https://www.sussexstreet.org.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('Tenants Queensland', 'https://tenantsqld.org.au/feed/', 'rss', NULL, 'news'),
  ('Tenants Victoria', 'https://tenantsvic.org.au/feed/', 'rss', NULL, 'news'),
  ('Tenants'' Union of NSW', 'https://www.tenants.org.au/rss.xml', 'rss', NULL, 'news'),
  ('Tenants'' Union of Tasmania', 'https://tutas.org.au/feed/', 'rss', NULL, 'news'),
  ('Townsville Community Law', 'https://townsvillecommunity.law/feed/', 'rss', NULL, 'news'),
  ('University of Melbourne Student Union Legal Service', 'https://umsu.unimelb.edu.au/news/rss/6013/', 'rss', NULL, 'news'),
  ('West Heidelberg Community Legal Service', 'https://www.holstephealth.org.au/feed/', 'rss', NULL, 'news'),
  ('Western NSW Community Legal Centre', 'https://www.wnswclc.org.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('Western Sydney Community Legal Centre', 'https://www.wsclc.org.au/feed/', 'rss', NULL, 'news'),
  ('Wheatbelt Community Legal Centre', 'https://www.wheatbeltclc.com.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('Whittlesea Community Connections', 'https://www.whittleseacommunityconnections.org.au/feed/', 'rss', NULL, 'news'),
  ('Wirringa Baiya Aboriginal Women''s Legal Centre', 'https://www.wirringabaiya.org.au/feed/rss2', 'rss', NULL, 'news'),
  ('Women''s Legal Centre ACT', 'https://www.wlc.org.au/feed/', 'rss', NULL, 'news'),
  ('Women''s Legal Service SA', 'https://www.wlssa.org.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('Women''s Legal Service WA', 'https://www.wlswa.org.au/feed/', 'rss', NULL, 'news'),
  ('Working Women''s Centre SA', 'https://wwcsa.org.au/feed/', 'rss', NULL, 'news'),
  ('YFS Legal', 'https://www.yfs.org.au/feed/', 'rss', NULL, 'news'),
  ('Youth Advocacy Centre', 'https://yac.net.au/feed/', 'rss', NULL, 'news'),
  ('Youthlaw', 'https://youthlaw.asn.au/feed/', 'rss', NULL, 'news'),
  ('commUnity+ Legal', 'https://comm-unityplus.org.au/feed/', 'rss', NULL, 'news'),
  ('inTouch Women''s Legal Centre', 'https://intouch.org.au/feed/', 'rss', NULL, 'news'),
  ('knowmore Legal Service', 'https://knowmore.org.au/feed/', 'rss', NULL, 'news'),
  ('LawRight Court and Tribunal Services', 'https://lawright.org.au/feed/', 'rss', NULL, 'news'),
  ('Supreme Court of South Australia', 'https://www.courts.sa.gov.au/feed/', 'rss', NULL, 'news'),
  ('Victorian Civil and Administrative Tribunal', 'https://www.vcat.vic.gov.au/rss.xml', 'rss', NULL, 'news'),
  ('Dusseldorp Forum', 'https://dusseldorp.org.au/feed/', 'rss', NULL, 'funding'),
  ('Ecstra Foundation', 'https://ecstra.org.au/feed/', 'rss', NULL, 'funding'),
  ('Reichstein Foundation', 'https://reichstein.org.au/feed/', 'rss', NULL, 'funding'),
  ('The Ian Potter Foundation', 'https://www.ianpotter.org.au/news/rss', 'rss', NULL, 'funding'),
  ('Djirra', 'https://djirra.org.au/feed/', 'rss', NULL, 'news'),
  ('Family Violence Legal Service Aboriginal Corporation', 'https://www.fvlsac.org.au/feed/', 'rss', NULL, 'news'),
  ('North Australian Aboriginal Family Legal Service', 'https://naafls.com.au/feed/', 'rss', NULL, 'news'),
  ('Queensland Indigenous Family Violence Legal Service', 'https://qifvls.com.au/rss.xml', 'rss', NULL, 'news'),
  ('Law Society Public Purposes Trust', 'https://lawsocietynt.asn.au/index.php/feed/', 'rss', NULL, 'law_reform'),
  ('Legal Profession Board of Tasmania', 'https://www.lpbt.com.au/feed/', 'rss', NULL, 'law_reform'),
  ('Ombudsman Western Australia', 'https://www.ombudsman.wa.gov.au/rss.xml', 'rss', NULL, 'law_reform'),
  ('Community Legal Centres Tasmania', 'https://clctas.org.au/feed/', 'rss', NULL, 'news'),
  ('First Nations Advocates Against Family Violence', 'https://fnaafv.org.au/rss.xml', 'rss', NULL, 'news'),
  ('Justice Reinvestment Network Australia', 'https://justicereinvestment.net.au/feed/', 'rss', NULL, 'news'),
  ('National Native Title Council', 'https://nntc.com.au/feed/', 'rss', NULL, 'news'),
  ('HWL Ebsworth', 'https://hwlebsworth.com.au/feed/', 'rss', NULL, 'news'),
  ('Lavan', 'https://www.lavan.com.au/feed/', 'rss', NULL, 'news'),
  ('Law Access', 'https://lawaccess.org.au/feed/', 'rss', NULL, 'news'),
  ('Marrawah Law', 'https://marrawahlaw.com.au/feed/', 'rss', NULL, 'news'),
  ('South Australian Bar Association', 'https://sabar.org.au/feed/', 'rss', NULL, 'news'),
  ('Terri Janke and Company', 'https://www.terrijanke.com.au/blog-feed.xml', 'rss', NULL, 'news'),
  ('The Tasmanian Bar', 'https://tasbar.com.au/feed/', 'rss', NULL, 'news'),
  ('Australian Legal Technology Association', 'https://alta.law/feed/', 'rss', NULL, 'tech_justice')
ON CONFLICT (url) DO NOTHING;
