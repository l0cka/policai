# Source terms of use

Checked 2026-09-26 for the 21 active sources that are fetched as web pages
(`fetch_method = 'firecrawl'`). RSS feeds were not reviewed: publishing a feed
invites syndication. robots.txt was checked for every seeded source; none
disallows the URL we fetch.

The policy lives in the database. `sources.active = false` stops fetching.
`sources.allow_excerpt = false` keeps headline, link and date only: the
`items_enforce_excerpt_terms` trigger in `db/schema.sql` drops the excerpt on
every write. Apply changes with `db/migrations/2026-09-26-source-terms.sql`;
`db/seed.sql` repeats them for a fresh database.

| Source | Finding | Policy |
| --- | --- | --- |
| Ashurst | Terms s 7.1 forbid "data mining, robots, or similar data gathering or extraction methods designed to scrape or extract data" | Inactive; no excerpts |
| Allens | "None of the content or any part of it may be reproduced on any other Internet website" | No excerpts |
| MinterEllison | Prior written permission needed to reproduce any part for purposes other than personal or internal use | No excerpts |
| Legal Aid Queensland | "reproduction by any means is prohibited without the prior written permission" | No excerpts |
| Law Council of Australia | Terms page is empty; all rights reserved | No excerpts |
| FCLC VIC, ALS NSW/ACT, Grata Fund, Maddocks, Law and Justice Foundation NSW | Every automated request gets a bot challenge; terms could not be read | Inactive |
| Legal Aid NSW, Victorian Legal Services Board | Reuse permitted with their copyright notice | Allowed |
| Legal Aid WA, National Legal Aid | Reuse permitted with attribution (WA: non-commercial) | Allowed |
| AGD Consultations, NSW Law Reform Commission | CC BY 4.0 | Allowed |
| Legal Services Commission SA, CLC NSW, CLC Queensland, RACS, Paul Ramsay Foundation | No restriction found | Allowed |

Do not work around a bot challenge. To restore an inactive source, get the
publisher's permission or find a feed they publish.
