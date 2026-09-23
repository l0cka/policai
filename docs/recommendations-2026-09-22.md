# Policai improvement recommendations — 2026-09-22

Status: proposal for implementation. Nothing here is merged, staged or deployed.
Scope: root Policai application (`/home/l0cka/Work/Argus/live/policai`). Pro Bono
Radar (`apps/probono`) is referenced as a pattern donor, not modified.

Evidence base: live repo state, `public/data/meta.json` (collection run 70),
`src/lib/pipeline/sources.ts` (65 sources), `data/policies.json` (79 register
records), A2J dashboard source (`apps/probono/dashboard`), the A2J editorial-index
worktree (`/home/l0cka/Work/Argus/src/policai-a2j-editorial-index`, commit
`c53d782`), and the aipolicytracker.org repo skim (2026-09-22).

---

## 1. Source expansion: more .gov.au, but depth over breadth

**Honest assessment first:** the collector already watches **65 sources across
56 distinct .gov.au hosts**, covering every jurisdiction and every branch of
government that publishes AI activity: central agencies (PMC, pm.gov.au,
ai.gov.au, DTA, DISR, NAIC), portfolio departments (AGD, Treasury, Finance,
digital.gov.au, cyber.gov.au), regulators (OAIC, ACCC, APRA, ASIC, ACMA, TGA,
eSafety, TEQSA, AEC, FWC, ART, AEMC, PC, IP Australia, AHRC, ANAO, APSC),
Parliament (bills digests, three inquiry feeds), consultations (three portals),
all supreme courts, and a dedicated AI source per state/territory (NSW digital,
VIC AI, QLD QGEA, WA, SA Office for AI, TAS DPAC, ACT, NT). Breadth is **not**
the gap.

The real gaps, in priority order:

### Tier 1 — state/territory legislation registers and gazettes (highest value)

Only the **federal** register (`legislation-whats-new`) is tracked today. Every
state and territory has a legislation register that publishes new and amended
regulations — the exact instrument class the register tracks as `regulation`:

| Jurisdiction | Candidate source | Notes |
|---|---|---|
| NSW | `legislation.nsw.gov.au` (new/amended + NSW Government Gazette) | Register search pages may need the browser strategy |
| VIC | `legislation.vic.gov.au` (includes the Victorian Government Gazette) | Verify the whats-new surface |
| QLD | `legislation.qld.gov.au` | Queensland legislation register |
| WA | `legislation.wa.gov.au` | Western Australian legislation register |
| SA | `legislation.sa.gov.au` (+ SA Gazette) | Verify URL stability |
| TAS | `legislation.gov.tas.gov.au` | Smaller corpus, cheap to add |
| ACT | `legislation.act.gov.au` | ACT legislation register |
| NT | `legislation.nt.gov.au` | Verify availability |

Why this beats adding more media feeds: register records at `regulation` level
are the thin end of the 79-record corpus, and state regulations are where AI
obligations actually land (e.g. transport, consumer protection, health). Each
source needs the standard intake ritual: verify the listing page fetches via
plain HTTP or assign `fetchStrategy: 'browser'`, confirm the candidate-extract
rules against real pages, and dry-run before adding (`npm run collect -- --dry-run`).

### Tier 2 — tribunals and the federal family court

- **Federal Circuit and Family Court of Australia** (`fcfcoa.gov.au`) —
  practice directions and news; complements the existing `fedcourt-practice-notes`.
- **Civil/administrative tribunals**: NCAT (NSW), VCAT (VIC), SACAT (SA),
  ACAT (ACT), NTCAT (NT), QCAT (QLD). AI disputes (privacy, automated decisions,
  consumer matters) surface here before appellate courts do. Low frequency, but
  that is exactly what the register's `courts` view is for. Add as news/practice-listing
  sources; expect infrequent hits.

  **Status 2026-09-23:** `fcfcoa-practice-directions` (listing),
  `ncat-procedural-directions` and `qcat-practice-directions` (watched for
  content changes; their entries are PDF links) are added. VCAT practice notes
  link more than eight documents, so the page cannot be watched as a document
  and yields no index entries. SACAT, ACAT and NTCAT listing URLs are unverified.

### Tier 3 — parliamentary record

- **Hansard** via `parlinfo.aph.gov.au` (the host is already tracked for bills
  digests and inquiries) — second-reading speeches and committee exchanges on AI
  are where ministerial intent is stated. Pair with the existing QLD
  ministerial-statements pattern for NSW/VIC if volume permits.

  **Status 2026-09-23: not added.** A ParlInfo Hansard RSS query for
  "artificial intelligence" this year returns 346 items and 25 title matches,
  mostly duplicated senators' statement fragments. Restricting to second-reading
  or bills debates returns 42–44 items but no candidates, because debate titles
  name the bill, not AI, and the relevance filter reads titles. A useful Hansard
  source needs a full-text AI match restricted to bill debates, which is a
  collector change, not a source entry.

### Tier 4 — hygiene, not expansion

**Correction (2026-09-23).** Every `coverageEligible: false` result in
`public/data/meta.json` is a weekly source skipped because it was not due.
These results are not blind spots. The real blind spot is document sources
whose `lastCheckedBySource` in `data/watch-state.json` stops advancing while
`meta.json` still reports `success` for every run. On 2026-09-23 five tracked
documents were in this state (ACT AI policy, both OVIC generative-AI pages,
QLD QGEA AI, WA AI policy). The cause: each editorial publish recorded an
editorial-capture fingerprint that differs from the fingerprint the collector
computes. The collector then treats its own observation as an unreviewed
change and defers completion on every run. `/status` now reports these
sources as overdue. Fixed on `feat/status-coverage`: the collector now adopts
its own reading of a version an editor published (see `docs/collector.md`).
A live run against all five completed each check with no new reviews.

**What not to do:** do not add generic news aggregators, think tanks, law-firm
commentary or international sources. Policai's differentiator is official-source
only; that line is what makes the register citable.

---

## 2. Port from A2J (Pro Bono Radar) — what A2J does better

A2J earns its reputation on four patterns root Policai lacks. Port them onto
Policai's stronger editorial spine (Git-as-database, verification gates,
withholding) rather than adopting A2J's runtime model:

1. **Deadlines as first-class data.** A2J's dashboard leads with a dated
   deadlines rail ("Today", "Yesterday", days-until) computed from stored
   deadline records. Root Policai records dates as prose inside `content` and
   the timeline. Add a structured `deadlines` array to register records
   (title, date, precision, status) and render the same rail on the homepage —
   forward-looking dates are what a practitioner actually checks.
2. **Stream taxonomy for the developments feed.** A2J splits its feed into
   named streams (news / law reform / funding / tech & justice) with per-stream
   accents. Root developments is one undifferentiated list. A lighter
   classification (consultation / regulation / guidance / funding / incident)
   — already half-derivable from the existing classifier labels — would let
   readers filter by intent.
3. **A public health page.** A2J ships `/health` showing per-source status with
   ok/failed/never-run states. Root Policai publishes the same data only as
   raw `public/data/meta.json`. A small server-rendered `/status` page over the
   existing meta is a trust win for near-zero effort.
4. **"This week" editorial digest.** Shipped in #107. Original note: already in flight: `src/app/this-week/`,
   `src/lib/this-week.ts` exist uncommitted at the root (with Header.tsx
   modified) and `apps/probono/dashboard/app/this-week/` mirrors it. Finish and
   integrate that work rather than re-deciding it.

**What root Policai has that A2J must not dilute:** the verification/withholding
gates, staged source reviews, machine-confidence cap, and collector-never-writes-
register discipline. Any A2J pattern ported to the root must flow through those
gates — machine enrichment is not editorial approval (the rule already written
into `apps/probono/AGENTS.md`).

**Pending-work sequencing:** the editorial-index redesign (`c53d782`,
`feat/a2j-editorial-index-02`, full `npm run check` green at 514 tests + browser
verification) is committed on its branch but not merged; the root tree is dirty
with the This week feature and sits behind origin/main by 4. **Phase 0 of any
implementation is: land main, merge the editorial branch, integrate This week,
reach a clean tree.** Do not stack source additions on a dirty tree.

---

## 3. Port from aipolicytracker (2026-09-22 skim)

Ranking unchanged from the review; carried into this plan:

1. **`datePrecision` as a schema field** (`exact | month | year | tbd |
   unavailable`) on policy dates and deadlines — makes AGENTS.md's "no invented
   day-level precision" rule machine-checked in `src/lib/validate-data.ts`.
   Natural companion to the deadlines model in §2.
2. **Per-record provenance artifacts.** Every machine-readable export carries
   source URL, review status, confidence and last-verified date *inside the
   artifact*, and a never-verified record says "never confirmed against the
   official source" in those words instead of omitting the field. Concretely:
   a `policies/[id]` "copy for your context window" `.md`/txt export and
   provenance blocks on API responses.
3. **Time-based freshness gate with a ratchet budget.** Max age per record
   class (binding law in force 90d, obligations 180d, guidance 365d), CI fails
   when critical breaches exceed a budget that may only be lowered, and raising
   it requires argument in the PR. Complements `audit:register` (which detects
   content drift, not "nobody re-checked in a year"). Implement as a
   `scripts/freshness.ts` check wired into `npm run validate:data`.
4. **Completeness as a separate axis from freshness**, with required vs
   expected fields and only required ones gated. Publish both on the status
   page. Adopt the honesty framing verbatim: completeness of records that
   exist, not coverage of the world — the sourced-denominator gap is stated,
   not papered over.

**Not adopted:** obligations-as-records data model (too heavy for a solo
register), accounts/alerts/billing (commercial product surface), five-role
change gates (npm run check + the review workflow is sufficient here).

---

## 4. Implementation order

| Phase | Work | Effort | Verification |
|---|---|---|---|
| 0 | Clean tree: merge editorial-index, integrate This week, pull origin/main (done: #102, #107) | Half day | `npm run check` green on merged main |
| 1 | Quick wins: `/status` health page (shipped on `feat/status-coverage`, with overdue-source counts in `/api/status`); per-record `.md` provenance export; explicit "never confirmed" wording in API + exports | 1–2 days | New Vitest tests; `npm run check`; manual API spot-check |
| 2 | `datePrecision` field + validator support + backfill annotation on existing 79 records (annotate, never invent) | 1–2 days | `npm run validate:data` extended; 0 errors |
| 3 | Structured `deadlines` on register records + homepage rail (A2J pattern) | 3–4 days | Type + validator changes, rail tests, ISR verified on serving checkout |
| 4 | Source expansion Tier 1 (state legislation registers), then Tier 2/3. Done on `feat/status-coverage`: `vic-legislation-whats-new`, `fcfcoa-practice-directions`. NSW and SA registers refuse automated clients; QLD, ACT and TAS listing URLs are unverified | 1 day per source incl. verification | `npm run collect -- --dry-run --source=<id>`, then `npm run audit:sources` |
| 5 | Freshness gate + completeness checks in `validate:data`; publish both counts on `/status` | 2–3 days | Gate runs in CI; budget seeded from the measured backlog, lowered only |
| 6 | Coverage hygiene: superseded by the Tier 4 correction. Fix the fingerprint mismatch that stalls tracked documents | 1 day | `public/data/meta.json` coverage counts rise; `npm run audit:sources` |

Each phase ships independently; phases 1–3 are data/UI-only and deploy through
the standard data/ISR path, phases 4–6 touch the collector and need the
collection host checked out separately. No deployment without the usual
explicit approval and `policai-deploy.sh` procedure; never push a
production-targeted branch without checking the automatic deployment timer.

## 5. Standing rules this plan must respect

- Git is the database: no runtime state, no new dependencies on A2J's Postgres.
- Every new source: verified listing URL, dry-run before commit, coverage
  eligibility checked.
- Every new date field: precision stated; unverifiable precision goes in
  `content`, never as an invented exact date.
- Collector never writes `data/policies.json`; register changes stay
  editor-gated.
- `npm run check` before any handoff; docs updated with the change, not after.