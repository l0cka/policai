# Identity token comparison, 26 November 2026

Every host that carries a watch source or a public register, timeline or development record was read once with each token on 26 November 2026, from the collector host. Requests went through the HostGate: robots.txt, a 2 s gap per host, and one request at a time per host.

- **Current** is `Policai/1.0 (+https://policai.org)`. **Candidate** is `Policai/1.0 (+policai.org)`.
- **Plain HTTP** is HTTP/1.1 with the collector's headers and `Mozilla/5.0 (compatible; <token>)`.
- **Browser** is headless Chromium with the Chrome UA plus the token. It was run only for hosts that have a browser-strategy source.
- A status below 400 counts as an answer. A 404 means the host answered, but the URL has moved.

Result: 103 hosts were read. No host accepted the current token and refused the candidate. With the candidate, 21 hosts answered over plain HTTP and 15 hosts answered in the browser that refused the current token.

| Host | First URL source | Plain HTTP current | Plain HTTP candidate | Browser current | Browser candidate | Change |
|---|---|---|---|---|---|---|
| ministers.ag.gov.au | `source:agd-ministers-media` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| ministers.dewr.gov.au | `record:dewr-best-practice-guide-ai-adoption-workplace-draft-2026` | timeout | 200 |  |  | fixed |
| www.accc.gov.au | `source:accc-rss` | 403 | 200 |  |  | fixed |
| www.acma.gov.au | `source:acma-media` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.ai.gov.au | `source:naic-news` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.anao.gov.au | `source:anao-performance-audits` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.apsc.gov.au | `source:apsc-latest-news` | error:ETIMEDOUT | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.art.gov.au | `source:art-practice-directions` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.cyber.gov.au | `source:cyber-news` | timeout | 200 |  |  | fixed |
| www.dataanddigital.gov.au | `record:implementation-plan-policy-responsible-use-ai-government-2025` | timeout | 200 |  |  | fixed |
| www.digital.gov.au | `source:digital-gov-ai` | timeout | 301 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.dta.gov.au | `source:dta-media` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.education.gov.au | `record:australian-framework-generative-ai-in-schools` | timeout | 200 |  |  | fixed |
| www.esafety.gov.au | `source:esafety-media` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.fcfcoa.gov.au | `source:fcfcoa-practice-directions` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.finance.gov.au | `source:finance-news` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.industry.gov.au | `source:industry-ai-publications` | error:ETIMEDOUT | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.inslm.gov.au | `source:inslm-annual-reports` | timeout | 200 |  |  | fixed |
| www.minister.industry.gov.au | `source:industry-ministers-media` | error:ETIMEDOUT | 301 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.teqsa.gov.au | `source:teqsa-news` | timeout | 301 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| www.tga.gov.au | `source:tga-media` | timeout | 200 | error:net::ERR_HTTP2_PROTOCOL_ERROR | 200 | fixed |
| api.prod.legislation.gov.au | `source:legislation-whats-new` | timeout | timeout |  |  | same |
| asic.gov.au | `source:asic-newsroom` | 301 | 301 | 200 | 200 | same |
| blueprint.asd.gov.au | `record:asd-blueprint-secure-cloud-ai-usage-policy` | 308 | 308 |  |  | same |
| consult.industry.gov.au | `source:industry-consultations` | 200 | 200 | 200 | 200 | same |
| consult.treasury.gov.au | `source:treasury-consultations` | 200 | 200 | 200 | 200 | same |
| consultations.ag.gov.au | `source:agd-consultations` | 200 | 200 | 200 | 200 | same |
| dcdd.nt.gov.au | `source:nt-ai-assurance` | 200 | 200 | 200 | 200 | same |
| districtcourt.nsw.gov.au | `record:nsw-district-court-genai-practice-note` | 200 | 200 |  |  | same |
| djsir.vic.gov.au | `record:victorian-ai-mission-statement` | 200 | 200 |  |  | same |
| download.asic.gov.au | `record:asic-apra-resilience-at-frontier-ai-speed-2026` | 200 | 200 |  |  | same |
| engage.building.tas.gov.au | `record:tas-draft-statement-expectations-data-centres-ai-2026` | 301 | 301 |  |  | same |
| forms.digital.wa.gov.au | `record:wa-ai-assurance-self-assessment` | 200 | 200 |  |  | same |
| gazette.nsw.gov.au | `source:nsw-gazette-recent` | 200 | 200 |  |  | same |
| humanrights.gov.au | `source:ahrc-media` | 200 | 200 | 200 | 200 | same |
| irc.nsw.gov.au | `record:nsw-irc-practice-note-33-genai` | 200 | 200 |  |  | same |
| lec.nsw.gov.au | `record:nsw-lec-practice-note-genai` | 200 | 200 |  |  | same |
| legislation.nsw.gov.au | `source:nsw-legislation` | 403 | 403 |  |  | same |
| legislation.nt.gov.au | `source:nt-assembly-bills` | 200 | 200 |  |  | same |
| localcourt.nsw.gov.au | `record:nsw-local-court-practice-note-genai` | 200 | 200 |  |  | same |
| ncat.nsw.gov.au | `source:ncat-procedural-directions` | 200 | 200 | 200 | 200 | same |
| ntcat.nt.gov.au | `source:ntcat-procedural-directions` | 200 | 200 |  |  | same |
| ovic.vic.gov.au | `source:ovic-news` | 301 | 301 | 200 | 200 | same |
| parlinfo.aph.gov.au | `source:aph-bills-digests` | 403 | 403 | 200 | 200 | same |
| pmtranscripts.pmc.gov.au | `record:tl-2026-09-24-pm-discloses-openai-medicare-portal-access` | 200 | 200 |  |  | same |
| prod-internet-salt-functionapp.azurewebsites.net | `source:sa-parliament-bills` | 200 | 200 |  |  | same |
| prov.vic.gov.au | `record:victoria-ai-recordkeeping-guidance` | 200 | 200 |  |  | same |
| statements.qld.gov.au | `source:qld-ministerial-statements` | 200 | 200 | 200 | 200 | same |
| static.aph.gov.au | `record:tl-2026-10-12-joint-select-committee-ai-early-advice` | 200 | 200 |  |  | same |
| supremecourt-tas-gov-au.assets.ionatahosting.net | `record:tas-supreme-court-ai-guidelines-2026` | 200 | 200 |  |  | same |
| supremecourt.nsw.gov.au | `source:nsw-sc-practice-notes` | 200 | 200 |  |  | same |
| supremecourt.nt.gov.au | `source:nt-sc-practice-directions` | 200 | 200 | 200 | 200 | same |
| treasury.gov.au | `source:treasury-publications` | gate:refused | gate:refused |  |  | same |
| www.act.gov.au | `source:act-ai-policy` | 200 | 200 | 200 | 200 | same |
| www.aec.gov.au | `source:aec-media` | 200 | 200 | 200 | 200 | same |
| www.aemc.gov.au | `source:aemc-media` | 200 | 200 |  |  | same |
| www.afp.gov.au | `source:afp-publications` | 200 | 200 |  |  | same |
| www.ag.gov.au | `source:agd-news` | timeout | 404 |  |  | same |
| www.ai.sa.gov.au | `source:sa-office-for-ai` | 200 | 200 |  |  | same |
| www.aph.gov.au | `source:senate-ai-data-centres` | 403 | 403 | 200 | 200 | same |
| www.apra.gov.au | `source:apra-rss` | 200 | 200 |  |  | same |
| www.asic.gov.au | `record:asic-market-integrity-rules-ai-trading-2026` | 200 | 200 |  |  | same |
| www.countycourt.vic.gov.au | `record:vic-county-court-pnccv-1-2026` | 200 | 200 |  |  | same |
| www.courts.act.gov.au | `source:act-sc-practice-directions` | 200 | 200 |  |  | same |
| www.courts.qld.gov.au | `source:qld-courts-news` | 200 | 200 |  |  | same |
| www.courts.sa.gov.au | `source:sa-courts-news` | 301 | 301 |  |  | same |
| www.csiro.au | `source:csiro-news` | 200 | 200 |  |  | same |
| www.digital.nsw.gov.au | `source:nsw-digital-ai` | 301 | 301 |  |  | same |
| www.dpac.tas.gov.au | `source:tas-dpac-policies` | 301 | 301 | 200 | 200 | same |
| www.dpc.sa.gov.au | `record:tl-2026-10-08-sa-royal-commission-into-ai` | 200 | 200 |  |  | same |
| www.fedcourt.gov.au | `source:fedcourt-practice-notes` | 200 | 200 | 200 | 200 | same |
| www.forgov.qld.gov.au | `source:qld-qgea-ai` | 200 | 200 | 200 | 200 | same |
| www.fwc.gov.au | `source:fwc-news` | 403 | 403 | 200 | 200 | same |
| www.homeaffairs.gov.au | `source:homeaffairs-media-releases` | 403 | 404 |  |  | same |
| www.info.buy.nsw.gov.au | `record:nsw-ai-procurement-essentials` | 200 | 200 |  |  | same |
| www.ipaustralia.gov.au | `source:ipa-news` | error:UNABLE_TO_VERIFY_LEAF_SIGNATURE | error:UNABLE_TO_VERIFY_LEAF_SIGNATURE | 200 | 200 | same |
| www.legislation.act.gov.au | `source:act-legislation-whats-new` | 200 | 200 |  |  | same |
| www.legislation.gov.au | `record:federal-privacy-and-other-legislation-amendment-act-2024` | 200 | 200 |  |  | same |
| www.legislation.qld.gov.au | `source:qld-legislation-new` | 200 | 200 |  |  | same |
| www.legislation.sa.gov.au | `source:sa-legislation-whats-new` | 200 | 200 |  |  | same |
| www.legislation.tas.gov.au | `source:tas-legislation-statutory-rules` | 200 | 200 |  |  | same |
| www.legislation.vic.gov.au | `source:vic-legislation-whats-new` | 200 | 200 | 200 | 200 | same |
| www.legislation.wa.gov.au | `source:wa-legislation-as-made` | 200 | 200 |  |  | same |
| www.nsw.gov.au | `source:nsw-media-releases` | 200 | 200 | 200 | 200 | same |
| www.oaic.gov.au | `source:oaic-media` | 200 | 200 |  |  | same |
| www.parliament.nsw.gov.au | `source:nsw-parliament-bills` | 403 | 403 | 200 | 200 | same |
| www.parliament.qld.gov.au | `source:qld-parliament-bills` | 403 | 403 | 200 | 200 | same |
| www.parliament.tas.gov.au | `source:tas-parliament-bills` | 200 | 200 |  |  | same |
| www.parliament.wa.gov.au | `source:wa-parliament-bills` | 403 | 403 | 200 | 200 | same |
| www.pc.gov.au | `source:pc-media` | 308 | 308 |  |  | same |
| www.pi.nsw.gov.au | `record:nsw-pic-procedural-direction-pic13-genai` | 200 | 200 |  |  | same |
| www.pm.gov.au | `source:pm-media` | 200 | 200 |  |  | same |
| www.pmc.gov.au | `source:pmc-office-ai` | 200 | 200 | 200 | 200 | same |
| www.premier.tas.gov.au | `record:tas-local-community-benefit-fund-ai-data-centres-2026` | 200 | 200 |  |  | same |
| www.qcat.qld.gov.au | `source:qcat-practice-directions` | 200 | 200 | 200 | 200 | same |
| www.saet.sa.gov.au | `record:tl-2026-06-26-saet-adopts-supreme-court-genai-guidelines` | 301 | 301 |  |  | same |
| www.supremecourt.tas.gov.au | `source:tas-sc-practice-directions` | 301 | 301 |  |  | same |
| www.supremecourt.vic.gov.au | `source:vic-sc-practice-notes` | 200 | 200 |  |  | same |
| www.supremecourt.wa.gov.au | `source:wa-sc-practice-directions` | 200 | 200 |  |  | same |
| www.treasury.sa.gov.au | `record:sa-artificial-intelligence-ethics-policy` | 200 | 200 |  |  | same |
| www.vcat.vic.gov.au | `source:vcat-rss` | 200 | 200 |  |  | same |
| www.vic.gov.au | `source:vic-ai` | 200 | 200 |  |  | same |
| www.wa.gov.au | `source:wa-media-statements` | 200 | 200 | 200 | 200 | same |
