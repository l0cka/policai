# Re-confirm sweep, 26 November 2026

Goal: explain why the 26 November re-confirm sweep could batch only 7 of the records due in January 2027, and plan the remaining reviews so all of them are signed before 4 January 2027.

## Summary

- Akamai-fronted federal hosts refused any User-Agent that contains `https://`. On 26 November the declared identity changed to `Policai/1.0 (+policai.org)` (#801). A gated comparison of 103 hosts found no host that the change broke. [token-comparison.md](./token-comparison.md) has the evidence.
- Since #800, `propose` and `audit:register` read through the HostGate: robots.txt, a 2 s gap per host, and one host's records at a time.
- After both changes, a gated dry run on 26 November (run after #801 merged) reached almost every record host. The exceptions are listed below. Most January records still cannot batch, because 96 of them have a browser-capture baseline, and a browser baseline is never comparable with a server read. A full review from a server read stores a server fingerprint, so these records can batch from the next 90-day cycle.

## How each host answered

Tests ran from the collector host on 26 November 2026.

| Host | Old token | New token | Reading |
|---|---|---|---|
| dta, industry, minister.industry, cyber, digital, art, anao, fcfcoa, finance, ministers.ag, inslm, dataanddigital, ai, apsc, accc, acma, teqsa, tga, esafety, education, ministers.dewr | stream reset, timeout or 403 | 200 | Akamai rule on `https://` in the User-Agent |
| aph, parlinfo.aph, parliament.nsw, fwc | 403 | 403 | Plain HTTP is refused; the browser gets 200 |
| dpac.tas | 403 | 403 | Refuses every UA tried |
| oaic, courts.qld | 200 on single reads | 200 on single reads | Some reads in a run of several PDFs 2 s apart got 403, then 200 a minute later. Probably a burst limit |
| inslm (PDF), courts.sa (one sheet) | | | robots.txt disallows Policai for the document path |

## Records due through 31 January 2027

The source is a gated `npm run reconfirm:register -- propose --dry-run --due-within=67` for each kind, run on 26 November after #801 merged. The run wrote no data. It covers 133 records, which is every record that `npm run check:freshness -- --now=2027-01-31` reports overdue except `policy-responsible-use-ai-government-v2`, which is never batched. The count includes the 7 records that the first 26 November sweep put into local batches. Those batches were never committed, and a fresh `propose` replaces them.

| Outcome | Records |
|---|---|
| Unchanged, can batch now | 24 |
| Fetch works, browser-capture baseline | 76 |
| Linked-document set differs from the stored one | 2 |
| HTTP 403 in the run, burst-limited (oaic, courts.qld) | 10 |
| HTTP 403 (aph, parlinfo, parliament.nsw, ai.sa, dpac.tas) | 7 |
| Source moved: digital.nsw.gov.au redirects through a non-allow-listed host to nsw.gov.au | 5 |
| Source changed | 3 |
| robots.txt disallows Policai | 3 |
| Bot challenge (pmc) | 2 |
| Linked oecd-ilibrary.org PDF refuses the declared identity | 1 |

## Routes

- **A.** Re-confirm batch now. Run `propose`, which forms batches of at most 10 records per kind, and sign each batch within 7 days of the audit.
- **R.** Propose again at a slower pace (oaic, courts.qld). Unchanged records with a server baseline then go to A. The rest go to D.
- **D.** Full review from a declared server read. The new server fingerprint lets the next cycle batch the record. That a server read replaces a browser baseline is inferred from `compareRegisterSourceEvidence`. Confirm it on the first review.
- **E.** Full review in the maintainer's browser (dpac.tas, and documents that robots.txt disallows).
- **F.** Full review from a one-off Chrome+token read under the 1 November 2026 rule (APH, parlinfo, parliament.nsw, ai.sa, and the pmc bot challenge).
- **G.** Full review with a record fix: a changed source, a URL moved to nsw.gov.au, or a linked document.

A full review is a decision for each record: a proposal, then a passkey approval. The D to G taps are therefore sittings of about 10 records, not one signature each. `policy-responsible-use-ai-government-v2` (the DTA framework's policy) shares its source URL with the digital.gov.au records in tap 5, so it belongs in that sitting.

## Schedule

15 sittings, one per weekday from 1 to 21 December 2026, so everything is signed before 4 January. [plan-records.md](./plan-records.md) lists every record with its sitting, sign-by date, due date, host, failure, baseline and route.

| Sitting | Sign by | Records | Route |
|---|---|---|---|
| 1 | 1 Dec | 10 | A (8), with 1 R and 1 D record on shared URLs |
| 2 | 2 Dec | 10 | A |
| 3 | 3 Dec | 4 | A |
| 4 | 4 Dec | 8 | R (courts.qld, oaic) |
| 5 | 7 Dec | 9 (+ DTA framework policy) | D |
| 6 | 8 Dec | 10 | F, D |
| 7 to 11 | 9 to 15 Dec | 49 | D (2 A on shared URLs) |
| 12 | 16 Dec | 10 | G (1 R) |
| 13 | 17 Dec | 4 | E |
| 14, 15 | 18 and 21 Dec | 19 | D |
