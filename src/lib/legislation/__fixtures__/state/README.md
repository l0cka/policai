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
| `sa-salt-search-56-1.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/Search/?resultsPerPage=4000&motionType=0&parliamentSession=56th/1st&startDate=2026-05-04T14:00:00.000Z&endDate=2026-10-22T13:00:00.000Z |
| `sa-salt-bill-5619-assented.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5619 |
| `sa-salt-bill-5620-before-parliament.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5620 |
| `sa-salt-bill-5626-passed-amended.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5626 |
| `sa-salt-bill-5622-negatived.json` | https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5622 |

No bill on the Tasmanian list had reached Royal Assent, so the tests fill stage dates into the Crown Lands page to cover passage and assent.

SALT, the South Australian Parliament's legislative tracking API, returns one
`GetBillSummaries` row per House. The fixtures cover these bills:

- 5619, Petroleum Products Regulation (Emergencies and Other Matters) Amendment:
  assented as Act 1 of 2026.
- 5620, Statutes Amendment (Energy and Mining Reforms): adjourned at second reading.
- 5626, Statutes Amendment (Attorney-General's Portfolio): passed by the
  Legislative Council with amendments and in committee in the House of Assembly.
- 5622, First Nations Voice Repeal: negatived in the Legislative Council.

The dated search excludes bills whose `dateIntroduced` is `0001-01-01`. Four
current-session bills have that date. Omit `startDate` and `endDate` to
include them.
