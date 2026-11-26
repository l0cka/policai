# Re-confirm sweep, 26 November 2026

Goal: explain why the 26 November re-confirm sweep could batch only 7 of the records due in January 2027, and plan the remaining reviews so all of them are signed before 4 January 2027.

## Summary

- Akamai-fronted federal hosts refuse any User-Agent that contains `https://`. The declared identity is `Policai/1.0 (+https://policai.org)`. No HTTP/1.1 or header change helps. A UA without the scheme, such as `Policai/1.0 (+policai.org)`, was accepted on the ten hosts tested. Changing the declared identity is the maintainer's decision, so this report does not change it.
- Most January records cannot be batched even where the fetch works, because 96 of 126 have a browser-capture baseline, and a browser baseline is never comparable with a server read.
- `propose` and `audit:register` now read through the HostGate. Hosts that refuse the identity are not requested, and a host that does not answer costs one timeout per run. The gated dry run of all three kinds took 3 minutes.

## How each host answered

The tests ran from the collector host with curl on 26 November 2026. "Declared" is the collector's UA, `Mozilla/5.0 (compatible; Policai/1.0 (+https://policai.org))`, with its Accept and Accept-Language headers. "Chrome+token" is Chrome 149 with the same token appended.

| Host | Declared, HTTP/2 | Declared, HTTP/1.1 (the collector's path) | Chrome+token | Plain curl UA | Token without `https://` | Reading |
|---|---|---|---|---|---|---|
| dta, industry, cyber, digital, art | stream reset | no response before timeout | refused | 200 | 200 | UA rule on `https://` |
| anao | stream reset | no response | refused | 200 | 200 | Same rule. Added to `AUDIT_REFUSED_HOSTS` |
| fcfcoa, finance, ag, inslm | not run | no response | not run | 200 | 200 | Same rule. Added to `AUDIT_REFUSED_HOSTS` |
| dataanddigital | not run | timeout in the audit | not run | not run | not run | Probably the same rule (not curl-tested) |
| aph, parlinfo.aph | 403 | 403 | 200 | 403 | 403 | Answers only browser UAs |
| dpac.tas | 403 | 403 | 403 | 403 | 403 | Refuses every UA tried |
| courts.qld | 403 | 403 | not run | 403 | 403 | 403 on every read on 26 November, including a gated run after a cool-off. A record on this host batched on 25 November |
| oaic | 200 | 200 | 200 | 403 | 200 | Accepts the declared UA. The OAIC 403s came from a linked PDF on oecd-ilibrary.org |
| fedcourt | 200 | 200 | not run | 403 | 403 once | Accepts the declared UA. A 403 on the first run did not recur on the gated run |

The collector's plain path already uses HTTP/1.1 (`retrieveSourceOverHttp1`). Adding `Accept-Encoding` or full Chrome-style headers made no difference.

## Records due through 31 January 2027

The source is a gated `npm run reconfirm:register -- propose --dry-run --due-within=67` for each kind on 26 November. It covers 126 records beyond the 7 already in the 26 November batches. Together with `policy-responsible-use-ai-government-v2`, which is never batched, these are every record that `npm run check:freshness -- --now=2027-01-31` reports overdue.

| Outcome | Records |
|---|---|
| Unchanged, can batch now | 20 |
| Host refuses the declared identity (not requested) | 48 |
| Fetch works, browser-capture baseline | 31 |
| HTTP 403 (courts.qld, aph, dpac.tas and others) | 13 |
| Source moved: digital.nsw.gov.au redirects through a non-allow-listed host to nsw.gov.au | 5 |
| Linked oecd-ilibrary.org PDF refuses the declared identity | 2 |
| Bot challenge (pmc) | 2 |
| Source changed | 2 |
| No answer (dataanddigital) | 1 |
| robots.txt disallows Policai | 1 |
| More than 8 linked documents | 1 |

## Routes

- **A.** Re-confirm batch now. Run `propose`, which forms batches of at most 10 records per kind, and sign each batch within 7 days of the audit.
- **B.** Re-confirm batch after an identity change (server baseline on a refusing host).
- **C.** Full review that needs a read of a refusing host. That means the maintainer's own browser, or a declared server read after an identity change.
- **D.** Full review from a declared server read. The new server fingerprint lets the next cycle batch the record. That a server read replaces a browser baseline is inferred from `compareRegisterSourceEvidence`, and should be confirmed on the first review.
- **E.** Full review in the maintainer's browser only (dpac.tas, and the courts.sa sheet that robots.txt disallows).
- **F.** Full review from a one-off Chrome+token read under the 1 November 2026 rule. This covers courts.qld, APH, the pmc bot challenge, and untested 403 hosts.
- **G.** Full review with a record fix: changed source, moved URL, or linked documents.

A full review is a decision for each record (a proposal, then a passkey approval). The taps for routes C to G are sittings of about 10 records, not one signature each. `policy-responsible-use-ai-government-v2` (the DTA framework's policy) shares its source URL with the digital.gov.au records in tap 4, so it belongs in that sitting.

## Schedule

There are 16 sittings, one per weekday from 1 to 22 December 2026. The C sittings need the identity decision by 4 December, or they become browser sittings. [plan-records.md](./plan-records.md) lists every record with its sitting, sign-by date, due date, host, failure, baseline and route.

| Sitting | Sign by | Records | Route |
|---|---|---|---|
| 1 to 3 | 1 to 3 Dec | 21 | A (one D record shares a URL) |
| 4 | 4 Dec | 10 (+ DTA framework policy) | C |
| 5 | 7 Dec | 10 | F, D |
| 6 | 8 Dec | 10 | D |
| 7, 8 | 9, 10 Dec | 19 | C |
| 9, 10 | 11, 14 Dec | 18 | D |
| 11 | 15 Dec | 10 | G |
| 12 | 16 Dec | 2 | E |
| 13, 14 | 17, 18 Dec | 17 | C |
| 15 | 21 Dec | 6 | F |
| 16 | 22 Dec | 3 | B |
