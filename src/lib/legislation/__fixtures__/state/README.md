# State legislation fixtures

Raw response bodies saved verbatim on 22 October 2026 (Australia/Sydney) for the
state extractors. Every request used the collector identity
`Mozilla/5.0 (compatible; Policai/1.0 (+https://policai.org))` over plain HTTP,
after checking the host's robots.txt.

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
