# State legislation fixtures

Raw response bodies saved verbatim on 22 October 2026 (Australia/Sydney) for the
state extractors. Every request used the collector identity
`Mozilla/5.0 (compatible; Policai/1.0 (+https://policai.org))` over plain HTTP,
after checking the host's robots.txt. Rows marked "browser" were fetched with
the collector's own `createBrowserFetch`, because the host refuses plain HTTP.

| File | Source URL |
| --- | --- |
| `act-whats-new.html` | https://www.legislation.act.gov.au/WhatsNew/Index |
| `tas-bills.html` | https://www.parliament.tas.gov.au/bills |
| `tas-bill-commission-of-inquiry-2026.html` | https://www.parliament.tas.gov.au/bills/bills2026/commission-of-inquiry-miscellaneous-amendments-bill-2026-25-of-2026 |
| `tas-bill-crown-lands-treasury-complex-2026.html` | https://www.parliament.tas.gov.au/bills/bills2026/crown-lands-treasury-complex-bill-2026-17-of-2026 |
| `vic-bills-in-parliament.json` | POST https://www.legislation.vic.gov.au/api/tide/elasticsearch/content-legislation-vic-gov-au__production__sapi_node/_search with the bills-in-parliament query (see below) |
| `vic-bill-cannabis-legalisation-plebiscite-bill-2026.html` | https://www.legislation.vic.gov.au/bills/cannabis-legalisation-plebiscite-bill-2026 |
| `vic-bill-justice-legislation-amendment-sexual-offences-and-other-matters-bill-2022.html` | https://www.legislation.vic.gov.au/bills/justice-legislation-amendment-sexual-offences-and-other-matters-bill-2022 |
| `vic-bill-independent-broad-based-anti-corruption-commission-amendment-follow-money-bill-2026.html` | https://www.legislation.vic.gov.au/bills/independent-broad-based-anti-corruption-commission-amendment-follow-money-bill-2026 |
| `nt-bills-before-assembly.html` | https://legislation.nt.gov.au/en/LegislationPortal/Bills/Before-Legislative-Assembly (http) |
| `nt-bill-environment-legislation-amendment-safe-air-bill-2026.html` | https://legislation.nt.gov.au/~/link.aspx?_id=C23FB5CF42A14E088A4EC3995F911AF9&_z=z (http) |
| `qld-bills-before-the-house.html` | https://www.parliament.qld.gov.au/Work-of-the-Assembly/Bills-and-Legislation/Bills-before-the-House (browser) |
| `wa-current-bills.html` | https://www.parliament.wa.gov.au/parliament/bills.nsf/screenWebCurrentBills (browser) |
| `wa-bill-progress-A97052A7F3DF8F5548258DA800203E8B.html` | https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?openForm&ParentUNID=A97052A7F3DF8F5548258DA800203E8B (browser) |
| `nsw-current-session-bills.html` | https://www.parliament.nsw.gov.au/parliamentary-business/bills/current-session-bills?num_ranks=1000 (browser) |
| `nsw-bill-18875.html` | https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18875 (browser) |
| `wa-bill-progress-5107DFD50A7DA2E448258DEE0026841D.html` | https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?OpenForm=&ParentUNID=5107DFD50A7DA2E448258DEE0026841D (browser) |
| `sa-salt-search-56-1.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/Search/?resultsPerPage=4000&motionType=0&parliamentSession=56th/1st&startDate=2026-05-04T14:00:00.000Z&endDate=2026-10-22T13:00:00.000Z |
| `sa-salt-bill-5619-assented.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5619 |
| `sa-salt-bill-5620-before-parliament.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5620 |
| `sa-salt-bill-5626-passed-amended.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5626 |
| `sa-salt-bill-5622-negatived.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5622 |

No bill on the Tasmanian list had reached Royal Assent, so the tests fill stage dates into the Crown Lands page to cover passage and assent.

Victoria's bills-in-parliament page renders in the browser from its own
Elasticsearch proxy, which answers a plain HTTP POST with the collector identity.
`vic-bills-in-parliament.json` replays the page's query (filters
`field_bill_parliament_current: true`, `type: bill`, `field_node_site: 6`;
sort `_score` desc, `title_az` asc; `_source.exclude` `es_attachment` and
`rendered_item`) with `size` raised from the page's 40 to 100, so all 46 current
bills are in one response. Each hit's `_source.url` is `/site-6/bills/<slug>`,
and the public page is `https://www.legislation.vic.gov.au/bills/<slug>`.
Bill documents on content.legislation.vic.gov.au are disallowed by robots and
were not fetched.

The Victorian bill pages cover three stages:

- The Cannabis Legalisation Plebiscite Bill 2026 is a Council private member's
  bill with a first reading and a second reading moved.
- The Justice Legislation Amendment (Sexual Offences and Other Matters) Bill
  2022 passed both Houses and received Royal Assent as Act 38/2022.
- The IBAC Amendment (Follow the Money) Bill 2026 passed the Council and was
  defeated at first reading in the Assembly.

SA's dated search excludes bills whose `dateIntroduced` is `0001-01-01`. Four
current-session bills have that date. Omit `startDate` and `endDate` to
include them.

The Queensland and Western Australian pages were fetched in the browser,
because both parliaments refuse plain HTTP, including robots.txt, with an Azure WAF
403. In the browser, Queensland's robots.txt is a 404 and Western Australia's
allows these paths. The Western Australian bill is the Building and Construction
Industry (Security of Payment) Amendment Bill 2026, which passed both Houses on
7 May and 13 October 2026. The Northern Territory bill page shows only its
introduction date; its Status, Date and Amended fields are blank.

NSW Parliament refused plain HTTP, robots.txt included, with a Cloudflare 403
on 22 October 2026, so the NSW pages were fetched in the browser. The
current-session list renders 10 cards and loads more through
`/_design/rest-assets/funnelback/...`, a path robots disallows. With
`num_ranks=1000`, the page itself returns all 544 bills of the session in one
response. Each bill links through `search.parliament.nsw.gov.au/s/redirect`,
which robots disallows; read the billId from the redirect's encoded `url`
parameter instead of following it. The Western Australian page is the
Appropriation (Recurrent 2026–27) Bill 2026, Royal Assent 19 August 2026, Act
No. 10 of 2026, fetched with its canonical `OpenForm=` URL.
