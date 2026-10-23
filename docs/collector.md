# Collector Operations

The collector is the automation behind the Developments feed: it watches official Australian government pages and feeds for new AI-policy activity and records what it finds in the repo's data files. It replaced the old Vercel-cron scraper/pipeline in July 2026.

## What one collection pass does

1. Loads the seen-URL registry (`data/watch-state.json`) and the existing feed (`data/developments.json`).
2. For each due source marked `automation: automatic` in [`src/lib/pipeline/sources.ts`](../src/lib/pipeline/sources.ts) (daily sources every run, weekly sources every 6+ days):
   - admits every request through the host gate (robots.txt, a 2 s gap per
     host, `Retry-After`; see Politeness below),
   - fetches the index page or RSS feed,
  - rejects bot-challenge pages even when they return HTTP 200 or are
    mislabelled as generic binary content,
   - extracts readable text from HTML and text-bearing PDFs before assessment,
   - counts all extractable items separately from AI-policy candidates,
   - extracts AI-relevant link candidates ([`extract.ts`](../src/lib/pipeline/extract.ts)), unwrapping exact `/s/redirect` links only from allow-listed HTTPS hosts to a single, valid, once-decoded HTTPS `url` target on the existing official-host allow-list before canonicalisation and deduplication,
   - selects both new candidates and retryable pending candidates so repeated
     failures cannot monopolise a source's per-run limit,
   - fetches each new page and classifies it ([`classify.ts`](../src/lib/pipeline/classify.ts)).
3. Writes results:
   - detections (score ≥ 0.5) → `data/developments.json`,
   - AI detections (score ≥ 0.7) and all heuristic detections that enter the
     feed → also staged in `data/source-reviews.json`,
   - candidate retry state, direct-document fingerprints, per-host
     robots and backoff records, and the per-source `sourceHealth` ledger
     (`lastSuccessAt`, `firstFailureAt`, `consecutiveFailures`,
     `lastFailureClass`; [`source-health.ts`](../src/lib/pipeline/source-health.ts)) →
     `data/watch-state.json`,
   - coverage health, per-source item/candidate counts, and errors →
     `public/data/meta.json`.
   The site header strip reads `lastCollectedAt` ("Collected 17 Oct 2026,
   06:35 AEDT", Australia/Sydney) and shows `collector.health` and the
   `successfulSourceCount/dueSourceCount` ratio beside it
   ([`collection-strip.ts`](../src/lib/collection-strip.ts)). Below `sm` the
   detailed count cluster is hidden; a degraded run still shows a `degraded`
   marker next to the collected date so a phone reader sees the run is not
   fully healthy. `lastHealthyAt` is the last run with no failed due source,
   and is never shown as the collection date. `lastUsableAt` is the latest
   run whose health was not `failed` (healthy or `degraded`), and anchors the
   weekly window and the register freshness date (`collectionAnchor` in
   [`this-week.ts`](../src/lib/this-week.ts); Daniel, #324, closes #314). A
   run that fails one source stays `degraded` and still advances
   `lastUsableAt`, so one standing failure does not freeze the window. Only a
   `failed` run leaves it where it was; the register line then labels the
   older date "last passing collection" instead of "last collected".
   `/status` puts the two dates side by side and, from the ledger, names
   each automatic source that is failing and has had no successful check at
   or after that anchor (`sourcesNotReachedSince`), so the window states what it may miss.
   Skipped sources and candidate-only retries leave a source's ledger record
   unchanged. `validate:data` checks the order: `lastHealthyAt` is no later
   than `lastUsableAt`, which is no later than `lastCollectedAt`, and a
   failing ledger record's `lastSuccessAt` precedes its `firstFailureAt`.
4. The collector **never writes `data/policies.json`** — the register only changes through reviewed commits. The host wrapper `ops/collector/policai-collect.sh` fails a collection run that changes it. No GitHub workflow checks this, so a hand-made PR that edits the register is caught only by review.

Non-dry-run collection holds the same cross-process data transaction lock as
the editorial MCP workflow from its initial reads through its final atomic
writes. A publication therefore cannot be lost when collection concurrently
reconciles reviews, developments, watch state, or freshness metadata. Waiters
do not time out merely because a healthy collection or source audit takes more
than a minute. Automatic takeover is limited to an owner process proven dead
on the same host; every canonical replacement also checks the active token.

Candidate URLs are not permanently marked processed until their source page is
successfully retrieved and assessed. Retrieval failures remain pending for a
later run, including when the source index itself is temporarily unavailable.
HTML source coverage counts only allow-listed official links found in explicit
article, result, listing, news, publication, or media entry structures. Generic
lists, account/help links, and external-only results cannot make a soft-error
page look like a healthy publication index.
Candidate-only retries for a not-yet-due source are reported operationally but
do not count as successful scheduled coverage. Direct instrument pages are
monitored by content fingerprint and
produce a lead only after their initial baseline changes. A changed fingerprint
is not committed as the new baseline until the revised document is extracted
successfully. Scanned PDFs without an extractable text layer fail with an
explicit OCR/manual-review requirement and are retried.
A pending document version is always re-fingerprinted through the source's own
retrieval path (plain HTTP or the browser, with linked documents folded in),
even when the source is not due. Firecrawl markdown never produces a document
fingerprint: its hash is not comparable with the HTML-plus-attachments hash, so
using it would stage a false new version and supersede the pending one.
An unreadable changed-document version that reaches the retry limit remains a
failed source-health condition on subsequent runs until a reviewer resolves it
or the publisher serves a new readable version.

If a review/development multi-file write was interrupted, the retained
development snapshot repairs only active reviews as an unverified radar item.
Recovered review candidates are merged into `source-reviews.json` by stable id,
with the current collector snapshot winning. A successful retry therefore
persists enriched extraction, classification, proposed-record, and linked
development evidence instead of advancing watch state while retaining a stale
preliminary review.
Rejected reviews are never resurrected, and published reviews are reconstructed
from their approved record as promoted editorial developments.

On the first collector check, an existing policy's stored verified fingerprint
is the baseline when available; a mismatch stages an update immediately instead
of silently accepting the current source. Every later check also compares the
live source with that current canonical fingerprint: watch-state snapshots are
operational caches and cannot override a policy re-verified by an editor.
When the live bytes match an editorially updated fingerprint and no unresolved
transition exists, the collector reconciles its snapshot without creating a
false baseline-reversion review. Each later transition increments a
persisted change sequence, so a version that reappears after intervening
versions is reviewed again while retries of the same transition keep stable
ids and retain the original development detection timestamps. Scheduled
health checks never re-emit an unresolved transition as a new development.
That immutable sequence is copied to the source review and remains the
publication order even when approval refreshes its retrieval evidence. At the
start of every run, persisted reviews reconstruct any transition sequence that
was written before an interrupted watch-state write; a later source version
therefore cannot reuse the same sequence number. Active pending reviews are
recovered as pending candidates while extraction is incomplete. After
successful extraction/classification they become non-retrying
`awaiting_review` transitions, remaining unresolved until editorial publication
so a return to canonical bytes still creates a baseline-reversion review.
An approved review clears any exhausted-retry error and advances the
direct-document snapshot to the reviewed fingerprint, but remains explicitly
unresolved in watch state until publication. A pre-publication return to the
canonical fingerprint therefore stages a baseline-reversion review instead of
leaving the policy withheld indefinitely. Publication marks the transition
processed. Snapshot sequence checks prevent an older persisted
review from replacing a newer reviewed baseline. Rejected transitions are
reconciled as dismissed rather than retried against an editorial decision.
Publication may re-capture the source and record a canonical fingerprint that
differs from the collector's own reading of the same version. When the live
bytes match the reading the collector staged as the latest sequence, and that
sequence was published under the canonical fingerprint, the collector adopts
its reading as that published version: it marks the transition processed,
completes the check, and stages nothing. Any other mismatch still stages a
review. Without this rule such a source never completes a check, and
`/status` reports it overdue.
An unreadable changed version that later returns to the verified baseline also
creates a new sequenced `baseline_reversion` review. This prevents the obsolete
changed-version review from withholding a valid baseline forever while still
requiring an editor to confirm the live bytes before public access is restored.

Page publication dates come from, in order: a visible publication label, then
`dcterms.created`, `dcterms.issued`, `article:published_time` and
`itemprop="datePublished"` metadata, then publication-labelled `time` elements,
then the last-resort keys. The last-resort keys depend on the page's platform.
A page whose `<meta name="generator">` content contains `GovCMS` or `Drupal`
(any case) is a GovCMS page. It has no last-resort keys: there `dcterms.date`
is the edit time, and none of the Drupal and GovCMS pages checked for #195
carried `date`, so a `date` value on such a page has unknown meaning. Every other page falls back to `dcterms.date`, then `date`. A GovCMS
page with no publication label, publication metadata or labelled `time` element
has no publication date. Modified-time keys
(`dcterms.modified`, `article:modified_time`, `og:updated_time`) never set
`publishedAt`. Dates are read as written, so the source's own calendar day wins
whatever the machine's time zone.

HTML fingerprints cover exactly the date values extraction can read.
`publicationDateCandidates` in `src/lib/pipeline/date-metadata.ts` enumerates
them in the order extraction tries them: the visible publication label, the
first tag for each publication-date selector (`dcterms.created`,
`dcterms.issued`, `article:published_time`, `itemprop="datePublished"`),
every publication-labelled `time[datetime]` anywhere in the document, then the
first tag for each of the platform's last-resort selectors (`dcterms.date`,
then `date`, on non-GovCMS pages). Each candidate records its selector (or
`label` or `time`) and its value, not where on the page it sat. Extraction
takes the first candidate that parses. The fingerprint hashes the whole
ordered list, so any change to the value extraction reads changes the
fingerprint: a tag that carries the key on `property` or `itemprop` beside an
unrelated `name`, a swap of duplicate tags, or a publication `time` in a
footer or in an aside inside `main` (#250). The platform itself is not
hashed: a Drupal or GovCMS generator gained or lost changes the fingerprint
only where it changes the last-resort candidates, that is on a page carrying
a `dcterms.date` or `date` tag. With neither tag the platform changes nothing
extraction reads, and `date-metadata.test.ts` pins that the fingerprint stays
the same (#290). The fingerprint also hashes the main region's visible text, relevant
instrument links, `time[datetime]` values inside the main region, and a keyed
metadata set: the date keys above, the modified-time keys `dcterms.modified`
and `article:modified_time` (`og:updated_time` is neither read nor
fingerprinted), `dc.date`, `og:title`, `citation_title` and
`citation_publication_date`. The keyed set takes each tag's `name`, else
`property`, else `itemprop`, and is a change signal, not the date cover. The
date selectors and the key set come from the one table in
`date-metadata.ts`, and `date-metadata.test.ts` fails if a selector, a
shared-attribute tag, a duplicate swap or an out-of-region `time` can change
the extracted date without changing the fingerprint. Browser captures accept
the same metadata keys, and only those: a browser-capture fingerprint
(`stableMetadata` in `src/lib/source-ingest.ts`) carries no candidate list,
so the three #250 patterns are not covered there.

Two earlier HTML fingerprint schemes may still be stored. The pre-#195 scheme
omits `dcterms.created` and the date platform. The #244 scheme records dates
as a sorted set with a `date-platform:` entry, so it misses the #250 values.
Retrieval also computes this reading's fingerprint under both
(`earlierContentHashes`, the #244 value first, in memory only), and
`matchesRetrievedContent` in `src/lib/pipeline/fetch.ts` is the one
comparison of a fresh retrieval with a stored hash (#249). It accepts the
current fingerprint or either earlier one and is used for watch-state
snapshots, verified policy and timeline hashes, staged transitions and their
pending candidates, the change-reason label, the `discoveredAt` retention of a
re-staged review, the register audit, and the re-staging, approval and
publication gates. The three preimages are disjoint: only the current one
carries a `publicationDates` list, only the #244 one carries a
`date-platform:` entry, and the pre-#195 one carries neither. No page has
equal fingerprints under two schemes, so a stored hash that matches an
earlier fingerprint was written under that scheme, and a page that gains
`dcterms.created` or a Drupal generator after its #244 fingerprint was stored
reads as changed (#262), the generator because the stored #244 preimage
recorded the platform. Once the snapshot holds the current fingerprint the
platform counts only through the last-resort candidates, as above, for
snapshots and current-scheme verified hashes; a record whose verified hash
is still #244 stages one review until re-approval.
Stored-to-stored comparisons (two staged reviews of one transition, the DTA
artifact or a court requirement against its policy) compare hashes as before
and still need both sides re-verified together. `transitionForDocumentHash`
in the pending-candidate loop compares the fresh current fingerprint with the
latest staged transition and never accepts an earlier-scheme match: it runs
only after that candidate failed `matchesRetrievedContent`, and the candidate
it would reuse is either that same transition or one dismissed when a later
transition was staged. Unchanged content therefore never reads as changed
after a scheme change, and no stored file needs a migration. Each
direct-document source's first successful check after a scheme change
rewrites its snapshot in `data/watch-state.json` to the current fingerprint
without a change count or review. A source that fails or is not due keeps its
stored hash until its next successful check.

Earlier-scheme acceptance is gated by the watch-state snapshot. The collector
writes the current fingerprint to the snapshot once it has processed a
reading. A stored earlier-scheme hash (a verified record hash, or the latest
transition the snapshot has recorded) matches a reading by its earlier
fingerprint only while the snapshot is absent, equals that stored hash, or
equals this reading. A pending transition the snapshot has not yet recorded
matches by an earlier fingerprint alone. Once the snapshot holds the current
fingerprint, a later change confined to a value the stored scheme ignored
(`dcterms.created` under pre-#195, a platform change that adds or removes
a last-resort candidate under pre-#195, a shared-attribute tag, a duplicate
swap or an out-of-region publication `time` under #244),
including a field appearing on a page that lacked it, no longer matches and
stages a review, on the direct path and on the adoption path alike. A change
to such a value between the last verification and the first processed
reading cannot be detected: the old baseline never recorded it. The register
audit has no snapshot, so it reports such a record unchanged under an
earlier-scheme match and, with `--write-evidence`, keeps the stored
fingerprint while it updates `lastSourceAuditAt` and the retrieval details.
Register hashes become current when a record is next approved or published,
and the audit stays blind to the values the stored scheme ignored until then.

Linked PDF, Word, and RTF documents are retrieved and their byte hashes are folded into the landing page's fingerprint. A landing
page therefore changes when a document is replaced at the same URL, even if
both the HTML and the words “Download policy” stay the same. If a linked
instrument cannot be retrieved as a document, the source check fails rather
than silently blessing only the landing page. Expected PDF, Word, and RTF byte
signatures are validated before the response is included in the fingerprint.
An ordinary HTML link is not an attachment merely because its text mentions a
policy document: it must use a binary extension, declare a document type, carry
a `download` attribute, or use an explicit download/attachment path, and its
link context must identify a relevant policy, standard, framework, guidance,
regulation, legislation, practice note, or instrument. Unrelated documents in
the same `<main>` region do not affect policy fingerprints or health.
The retrieved attachment bytes are retained for the same pass and every linked
instrument must then be readable before the page counts as healthy. PDF and
DOCX text is combined with landing-page text for assessment; image-only PDFs,
legacy DOC, RTF, corrupt documents, and other unsupported binaries require a
verified manual transcription rather than allowing the landing page alone to
advance coverage.
This attachment hashing applies to canonical instrument pages and candidate
pages, not discovery indexes or feeds; index retrieval must remain healthy even
when a listing contains many unrelated attachments.
The read-only source-catalogue audit uses the same source-kind rule as scheduled
collection so its health result cannot disagree merely because an index has
attachments.

When a changed direct document is already the source for a register policy, the
collector stages a version-specific update review with `targetPolicyId`; it
does not propose a duplicate policy. A record is matched through the same
identity set that keeps its URLs out of discovery: its `sourceUrl` plus its
verification `url` and redirect `finalUrl`. When the watched URL is such an
alias, the review carries the record's canonical `sourceUrl`, while its source
evidence and linked development keep the URL the collector retrieved. Timeline
events match the same way. Pending and approved update reviews
temporarily withhold that policy from public reads until an editor publishes
the re-verified record. These reviews cannot be rejected. Publishing refuses an
older update when a newer non-rejected source version exists, and publishing
the newest version rejects older still-active update reviews as superseded.

## Classification

Candidates that survive dedup are classified by keyword heuristic by default.
With `USE_CLEF_CLASSIFIER=1`, the local `clef-flash` model on Argus decides
relevance instead (`src/lib/pipeline/clef-classify.ts`). Each candidate's
title, source name and a 600-character excerpt go to Ollama's System One
endpoint on `127.0.0.1:11434` as one `noul` question ("Is this item
Australian AI policy, regulation, governance or court guidance?"), and the
model's P(true) becomes the score. An item at 0.5 or above is relevant.
Summary, type and jurisdiction still come from the keyword rules, and the
assessment records `promptVersion: 'clef-noul-v1'`. The log carries one
`model score` line per scored candidate, so a dismissal's confidence can be
read back. Register search hits (Federal Register, SA, Vic and state bill
lists) are scored too. Without a score they keep the fixed 0.55 search-match
rule (`register-search-v1`).

Clef never fails a run. `scripts/collect.ts` checks once per run that at least
13 GB of GPU memory is free (`nvidia-smi`, which must report exactly one GPU;
a second card would need that check changed) and that the model is installed. If
not, the run logs why and uses the keyword rules. A malformed or failed answer
for one candidate leaves only that candidate on the keyword rules. The request
carries no tools and nothing leaves the machine. The scheduled wrapper refuses
the retired cloud classifier (`USE_CLAUDE_CLASSIFIER`, `CLASSIFIER_BASE_URL`,
`CLASSIFIER_API_KEY`) and passes `USE_CLEF_CLASSIFIER=1` through.

Sources with `bodyRelevance` (currently `aph-hansard-bill-debates`) use a
third deterministic rule instead of either path above. Their feed items are
kept when the title matches `bodyRelevance.titlePattern`, because Hansard debate
titles name the bill, not AI. After the page is fetched, a candidate is
relevant only when its body has at least `bodyRelevance.minAiMentions` explicit
AI mentions (`countAiMentions` in `src/lib/scraper-filter.ts`). Relevant items
score 0.55 with `promptVersion: 'body-mentions-v1'` and a summary that states
the mention count. These sources are not sent to Clef.

Confidence from either classifier path is capped at 0.65
(`MACHINE_CONFIDENCE_CAP`) before it is stored or shown, so every automated
discovery displays as "Needs review" and goes through the same staged
editorial process regardless of which path produced it.

The cap applies to classifier confidence only. Direct-document change
detections — a monitored record's page whose content fingerprint moved —
store `relevanceScore: 1` by design: relevance is not in question for an
instrument the register already tracks, so the score records certainty that
the page changed, not a classifier's judgement. The detection kind owns the
classification: a change on a tracked policy or timeline event is never sent
to a classifier, always carries `classification: 'heuristic'` and
`promptVersion: 'source-hash-change-v1'`, and always stages a review,
whichever classifier path is active. The review gate (`qualifiesForReview` in
`collect.ts`) keys these detections on that `promptVersion`, not on the
classification label. For a Clef detection it compares the uncapped
`rawConfidence` with the review threshold, because the capped score could
never clear it. `rawConfidence` is used for that decision only and is never
persisted. These detections land as
`needs_review` and pass through the identical editorial gate; the cap and
the score-1 path never let an automated detection publish anything. `data/policies.json` is never written by either path:
a Vitest test asserts the file is byte-identical before and after a
collection run, and a separate guard step fails the run if the
file changed on disk (see Production automation below).

## Running locally

```bash
npm run collect -- --dry-run              # preview, writes nothing
npm run collect -- --source=apra-rss      # one source
npm run collect                           # full pass, writes data files
npm run audit:sources                     # automatic catalogue live audit
npm run audit:sources -- --include-manual # diagnostic attempt of all sources
npm run audit:register                    # curated source fingerprint check
npm run validate:data                     # structural checks (same as CI)
```

The source audit applies the same document extraction/readability requirement
as collection; an HTTP 200 response containing a corrupt or image-only PDF is a
failed automatic-source audit, not healthy coverage.

The source catalogue deliberately separates:

- **automatic sources** — reliably return usable content to the collector; and
- **manual sources** — official endpoints that reject every automated client,
  including the headless browser.

Most previously-manual sources are automatic again since the collector gained
a headless-browser retriever (`src/lib/pipeline/browser-fetch.ts`, Playwright
Chromium). For sources marked `fetchStrategy: 'browser'`, an `html-index`
listing page is read through Firecrawl first and extracted from its `rawHtml`,
falling back to the browser when Firecrawl fails or the page yields no items.
An `http` source whose plain fetch fails, or returns an empty index, takes the
same Firecrawl-then-browser route. Firecrawl declares the Policai identity like
every other path; it reaches GovCMS hosts that reset the browser's HTTP/2
connection. RSS, register and document sources never read their own page
through Firecrawl, because the renderer would change a feed's XML or a
document's content hash. For a candidate page, Firecrawl's body is its
markdown, and its `rawHtml` is used only to find linked documents (see below).
Candidate pages discovered from those sources (but never a document source's
own page) are retrieved through a
self-hosted Firecrawl instance first (`src/lib/pipeline/firecrawl.ts`),
falling back to the browser when Firecrawl is unavailable, times out, or
returns no usable markdown or raw HTML. Sources carrying an identity exception bypass
Firecrawl and use the scoped browser (see Collector identity below). Every other source falls back to the browser when
the plain HTTP client is blocked or an index renders no extractable items. CI
installs the browser with `npx playwright-core install --with-deps chromium`
(cached between runs); without it the collector still runs, minus the
fallback.

A Firecrawl scrape requests both `markdown` and `rawHtml`. The markdown is
replayed through `retrieveSource` as `text/plain` (extraction reads HTML, XML
or plain text, not `text/markdown`), so a Firecrawl page carries the same
evidence shape and bot-challenge checks as any other retrieval. The raw HTML
is used only to find linked instruments with the same rule as other HTML
pages. Each linked document is then retrieved through the collector's own HTTP
client and folded into the fingerprint and readability check exactly as for an
HTTP or browser page. If that HTTP retrieval fails, the candidate is retried
through the browser retriever (whose linked documents use the browser), except
after a destination mismatch, which fails the candidate.

| Check on a Firecrawl candidate | Enforced by |
| --- | --- |
| Allow-list and public-address check on the requested URL | Collector, before discovery |
| Redirect hops inside Firecrawl's own fetch | Not checked: Firecrawl follows them internally and does not report them |
| Allow-list and public-address check on the final URL | Collector, on Firecrawl's reported `sourceURL` |
| Linked-instrument discovery | Collector, on Firecrawl's `rawHtml` |
| Each linked document, including every redirect hop | Collector's HTTP client, hop by hop |
| Linked-document byte signature and readability | Collector, as for HTTP and browser pages |

Firecrawl is demand-started on the collection host: a proxy on port 3003 wakes the stack on
the first request and an idle timer stops it again, so the first candidate
fetch after idle takes longer (around 17.5 seconds observed) than a warm one.
`FIRECRAWL_URL` overrides the default `http://127.0.0.1:3003`.

### Collector identity

The collector identifies itself as `Policai/1.0 (+https://policai.org)`
on every retrieval path. A refusal of that identity is a block we respect: the
source moves to manual tracking. No source carries an identity exception.
The E24 exception, which let 16 Commonwealth sources present a plain browser
UA while an allow-list request was pending, expired at 2026-10-21 00:00 AEDT
and was removed after the first collection run on or after that date (#162).
`npm run report:e24` lists what a run did with those 16 sources
([scripts/README.md](../scripts/README.md#e24-reportts)).

How each path presents it (`src/lib/pipeline/identity.ts` holds the token):

- Plain HTTP (Node fetch and the HTTP/1.1 fallback):
  `Mozilla/5.0 (compatible; Policai/1.0 (+https://policai.org))`, for every
  source, including one with an exception. Format change: before E24 this string
  was `Mozilla/5.0 (compatible; Policai/1.0; +https://policai.org)`, so
  server-log or WAF rules that match the old string exactly need updating;
  rules that match `Policai/1.0` still match.
- Headless browser: the reduced Chrome UA of the launched build with the
  token appended, e.g. `... Chrome/149.0.0.0 Safari/537.36 Policai/1.0
  (+https://policai.org)`. Never `HeadlessChrome`.
- Firecrawl: the scrape request sends `headers: { "User-Agent": ... }` with
  the same Chrome-plus-token string (Chrome version from
  `REFERENCE_CHROME_VERSION`, because Firecrawl's renderer does not report
  its own). Self-hosted Firecrawl forwards `headers` to its fetch, Playwright
  and document engines; the Playwright service applies `User-Agent` at the
  browser-context level. Custom request headers disable Firecrawl's URL-index
  cache reads and writes; this is not a guarantee about every upstream cache.

The exception mechanism remains for a future decision: the optional
`identityException: { until, reason }` field on a `WatchSource`. Granting one
needs Daniel's approval; `sources.test.ts` fails while any source carries the
field. It expires at the START of `until` in Australia/Sydney (for an `until`
of 2026-10-21, at 2026-10-20T13:00:00.000Z).

Retrieval carries the registered source ID, exact listing URL and expiry,
not a transferable exempt flag. Before each request the authority is checked
against the registry, the current wall clock and the destination's exact HTTPS
origin. No sibling subdomain, other approved source, redirect destination or
third-party document inherits permission merely because its referring source
is exempt. Same-origin candidates and documents retain the authorised behavior.
Plain HTTP always declares the identity.

Browser contexts always declare the identity. For sources carrying exception
authority, a page-scoped Chromium CDP Fetch interceptor sets the UA before each
outgoing request, including browser-managed redirect hops, subrequests and
in-page document downloads. It rechecks the wall clock on every hop; a long run
cannot carry an active run-start exemption past expiry. Playwright routing alone
is insufficient: route header overrides persist across redirects. If scoped
interception cannot be installed, retrieval fails before navigation. Traffic
outside that page interceptor (including workers, popups and WebSockets) keeps
the declared context UA. Existing destination checks and the pinned egress proxy
remain in place.

Firecrawl cannot enforce this per-hop exception. All candidate pages belonging
to a source with `identityException` bypass Firecrawl and use the scoped browser,
even cross-origin candidates (which declare identity) and even after expiry,
until the exception field is removed. The Firecrawl client also rejects a bare
exempt request before contacting the service. Other sources retain the declared
Firecrawl path and browser fallback. No Firecrawl installation is changed.

After expiry the declared identity is used, the run log says `identity exception
expired`, and the source's `sourceResults` entry in `meta.json` carries
`identityException: "expired"` (`"active"` at assessment while it applies).
These operator labels describe the assessment, not permission carried to later
requests. A refusal is reported as an ordinary source failure.
`npm run validate:data` prints a warning, not an error, for each expired
exception, so expiry remains visible without failing CI.
`npm run audit:sources` carries the same source-bound authority to retrieval
and tags each exception source's line with
`[identity exception active until <until>]` (exclusive, Sydney) or
`[identity exception expired on <until>]` (`identityException` and
`identityNote` in `--json`). Source retirement is a separate editorial approval:
remove the exception after allow-listing, or move a still-refusing source to
manual tracking. The collector never automatically changes canonical source
status; `cyber-news` remains manual without an exception.

Manual sources remain enabled. Review them with a browser and record the result
through the MCP `record_manual_source_review` tool, supplying the human
reviewer's identity separately from the admin token, substantive notes that
describe what was inspected, and any available browser evidence (title,
publisher, final URL, retrieval metadata, or fingerprint). A refresh merges
with previously retained evidence rather than erasing it. A successful check
without evidence and at least 20 characters of notes is neither valid data nor
current coverage. Coverage is stored in
`data/source-monitoring.json` with that attribution and shown separately from
automatic health.

All discovered and editor-supplied source URLs pass through one identity
normalizer before extraction, state keys, collision checks, and storage. It
removes fragments, known campaign parameters, and non-root trailing slashes,
while retaining and sorting query parameters that may select real documents.
This prevents cosmetic URL variants from creating duplicate leads or records.

A targeted `--source` run may diagnose either source mode, but it does not
overwrite global collection health. It still exits non-zero when that targeted
run is unhealthy, after persisting retry and snapshot state. Targeted runs
force the selected source regardless of its normal daily/weekly due time.

### Politeness

Every request the collector itself issues passes through one `HostGate`
([`host-gate.ts`](../src/lib/pipeline/host-gate.ts)): plain HTTP, the
HTTP/1.1 fallback, each plain-HTTP redirect hop, every linked document, the
headless browser's navigation and the target of each Firecrawl scrape. Not
gated: the browser's own sub-resource and in-page requests, the redirect
hops the browser and Firecrawl follow themselves (only the final URL is
admitted, after the fact), Firecrawl's own fetches, and the hops of the
robots.txt request itself. `collect()` requires the gate;
`scripts/collect-run.ts` builds the production one and hands it the `hosts`
records from `data/watch-state.json`. The host is the unit: `url.host`
lowercased with any trailing dot removed, port included. The gate never
makes a run worse than a run without it, except where robots.txt states a
`Disallow` or a host asks to be left alone (`Retry-After`, a bare 429, a
browser 403); `collect.never-worse.test.ts` holds that property against a
neutral gate.

The gate is RFC 9309 with one deliberate departure. RFC 9309 section
2.3.1.4 says a crawler MUST treat an unreachable robots.txt (5xx, network
error) as complete disallow for a while. The collector instead keeps the
last robots.txt it read (the RFC's cached copy) and otherwise allows, and
retries on the next run. The reasons: its 75 sources are editorially chosen
pages; many sit behind a WAF that answers a plain HTTP client with a
challenge page, a reset or a stall rather than a 5xx, and a WAF that blocks
the robots fetch is not a server asking us to stop; and QA's simulation
showed RFC-strict behaviour failing 140 of 560 modelled runs that pass
today. Politeness still holds without robots.txt: the 2 s gap, `Crawl-delay`
from any copy held, `Retry-After` and the breaker all apply whatever
robots.txt says. So that an unreachable robots.txt never becomes a
permanent silent allow, a host whose robots.txt has never been read and has
been unreachable on 3 consecutive runs is reported as robots unverified
(below).

- **robots.txt** ([`robots.ts`](../src/lib/pipeline/robots.ts), RFC 9309).
  Fetched at most once per host per run with the declared identity, over
  plain HTTP/1.1, before the first request to that host. When a WAF refuses
  the plain client (a 401, a 403 or a dropped connection) and the run has a
  browser, robots.txt is read again through the browser, so a host the
  collector reaches only by browser still has its rules read. An HTML answer
  from the browser is a challenge page, not robots.txt, and is discarded. The `Policai` group
  is used when present, else `*`. Matching is longest-match over `Allow` and
  `Disallow`, with `*` wildcards and a `$` end anchor, equal lengths allow,
  and percent-encoded unreserved octets compared decoded. A 2xx is parsed
  line by line, so an HTML or challenge page served with 200 yields no
  rules, and a 204 is an empty robots.txt that allows all. A `Crawl-delay`
  over one day (`CRAWL_DELAY_CAP_SEC`) is read as one day. A 4xx means
  allow all (`absent`), except a 401 or 403: that is a WAF refusing the
  reader, not a site without robots.txt, so it counts as `unreachable`.
  Anything else is `unreachable` too: a 1xx or 3xx left
  after redirects (such as a 304 without `Location`), a 5xx, a connection
  error, the 20 s timeout, a body over 500 KiB (it is not parsed in part),
  more than five redirects, or a redirect off https.
  An unreachable robots.txt never refuses a request and never trips the
  host: the gate keeps the copy it last read (`parsed` or `absent`, with
  that read's `fetchedAt`) when it has one and otherwise records
  `unreachable` and allows, then refetches on the next run. The run log
  names the hosts whose robots.txt was unreachable.
- **Robots unverified.** `robotsUnreachableRuns` on the host record counts
  consecutive runs whose robots fetch was unreachable, at most once per run,
  and returns to 0 on any 2xx or other 4xx. A host whose robots status is still
  `unreachable` (no robots.txt ever read) and whose count is 3 or more
  (`ROBOTS_UNVERIFIED_RUNS`) is robots unverified
  (`robotsUnverifiedHosts`). The run log then ends its host-gate lines with
  `[collect] robots unverified: <host>, <host>`, `meta.json` carries
  `collector.robotsUnverified` (sorted host keys, omitted when empty) and
  `/status` lists the hosts under "Robots unverified". The report changes no
  request or outcome. A host that once read robots.txt is never listed; it
  keeps that copy. A disallowed URL fails
  as `robots_disallowed` and is never requested; other paths on the host
  are unaffected. Parsed rules are cached for 24 h in the `hosts` record.
  Expect about half the hosts to refetch on a daily run, because the
  timer's random delay moves the run either side of 24 h.
- **Robots-fetch budget.** A run may spend at most 600 s
  (`ROBOTS_FETCH_BUDGET_MS`) of wall time on robots.txt fetches. The
  elapsed time of each `fetchRobots` call is charged. Once the budget is
  spent, later hosts skip the robots fetch for the rest of the run: they
  keep any cached `parsed` or `absent` copy, otherwise allow, and do not
  increment `robotsUnreachableRuns` (no attempt). This caps stalled
  robots.txt hosts at about 30 × 20 s under the wrapper's 3,500 s limit
  without a hard run deadline. A gzip- or br-encoded robots body (or any
  non-`identity` `Content-Encoding`) is treated as unreachable, so a
  previously parsed copy is kept rather than replaced with empty rules.
- **Gap.** At least 2 s between any two requests to one host, the robots
  fetch included. After a page request the host's `Crawl-delay` applies
  when larger, capped at 30 s; after the gate's own robots fetch only the
  2 s gap applies, so a fresh host's first page needs no `Crawl-delay`
  wait. Waits are taken inline; the per-request timeout starts after the
  wait.
- **Wait budget.** A run may spend at most 1,200 s (`WAIT_BUDGET_MS`) on
  waits a host asked for: the part of a `Crawl-delay` above the 2 s gap,
  and inline `Retry-After` waits. The 2 s gap is always waited and never
  charged, so a host that asked for nothing is never affected by the
  budget; those waits are bounded by 2 s per request, the design's model
  (476 s inferred worst case). The robots fetch itself is not a wait and
  is not charged against this budget; it has its own budget (below). The
  wait budget is about a third of the wrapper's 3,500 s deadline; a
  hostile `Crawl-delay: 30` on every host would otherwise need about
  6,500 s and the wrapper would kill the run with nothing written. Once
  the budget is spent, a candidate page, or a linked document of one,
  that needs a requested wait is deferred, not sent
  (`the run's N ms host-gate wait budget is spent`); see Deferral.
  A due source's index request is never deferred. It waits what the host
  asked for, up to the 30 s cap, whether or not the budget is spent, and
  so do its redirects, its retry, its browser fallback and, for a
  `document` source, the linked documents hashed into its fingerprint
  (`collect.ts` hands them the gate with `admit(url, 'wait')`). These
  waits are charged, so later candidates are deferred sooner. The reason
  is coverage: a due source marked `skipped` counts against the run's
  health, so an index is never deferred.
  An index wait is at most 30 s for each index request that follows
  another request to the same host. The model
  (`~/Reports/2026-10-17-policai-source-coverage/pr5-index-wait-model.mts`)
  puts 75 sources on 63 hosts, every host with `Crawl-delay: 30` and one
  index request per source, at 12 × 30 = 360 s of index waits. The run is
  then at most 181 s + 1,200 s + 360 s = 1,741 s, or 3,001 s if every host
  also stalls its robots fetch for 20 s, under the 3,500 s limit; the
  margin covers 28 more such index requests (70 without robots stalls).
  It does not cover every index failing and being retried on such hosts
  (about 8,500 s) or eight linked documents for every `document` source
  on one host (about 9,700 s). A cap small enough for those is about 3 s,
  which is the 2 s gap, so the cap stays 30 s and those cases are left
  to a hard run deadline (Not done here).
- **Retry-After.** A 429, or a 503 that carries `Retry-After` (seconds or an
  HTTP-date), sets `backoffUntil` on the host. A wait of up to 30 s is taken
  inline; a longer one refuses every request to the host as `rate_limited`
  (429) or `host_unavailable` (503) until it passes. A 429 without the header
  backs off 1 h, doubling on each further 429 that is not waited out inline
  to a 12 h cap (`BACKOFF_LADDER_CAP_MS`), below the daily run interval, so
  a host that rate-limits every day is still tried once a day; any 2xx or
  3xx resets the ladder, a 4xx leaves it. A 429 waited out inline does not
  climb it. An explicit `Retry-After` is honoured up to 24 h. A 503 without
  the header is an ordinary failure and does not back the host off, so one
  failing URL does not take its host out of the run. Backoff is persisted,
  so a run that starts inside a backoff still honours it.
- **Breaker.** A 403 returned to the headless browser trips the host for the
  rest of the run: later requests to it are refused at once as
  `identity_refused` (`<host> refused the headless browser with a 403
  earlier this run`). The wording avoids `HTTP 403` so a report that counts
  hosts refusing the identity (`\bHTTP 403\b`) counts the request that was
  refused, not the ones never sent. A 403 to plain HTTP or to Firecrawl does
  not trip it, because the browser fallback is the existing answer to WAF
  fronts that block plain clients. The breaker is in-memory only. The gate
  never infers a refusal from any other status; `failure.ts` labels those
  afterwards.
- **Deferral.** A candidate the gate refuses without a request (breaker,
  backoff or wait budget) is not a failure: it stays `pending`, keeps its
  attempt count and is tried on the next run, the same as a candidate the
  per-run cap left for later. Only a candidate that was requested and
  refused fails, and when the gate refuses the retry of a request that was
  made, the error reported is that request's response. The wait budget
  never defers a due source's index (see Wait budget), so no due source
  is ever `skipped`. A due source whose index the gate refuses (a robots
  `Disallow`, a backoff over 30 s, the breaker) fails for the run, with
  the refusal's class. A `robots_disallowed` refusal is terminal for the candidate.
- **Redirects.** Plain-HTTP hops are admitted before they are followed. The
  browser and Firecrawl follow redirects themselves, so their final URL is
  admitted after the fact when its host differs; a refusal discards the
  content and fails the request.

The host-gate lines of the run log start with
`[collect] host gate: waited <ms> ms across <n> hosts (most on <host>: <ms> ms)`.
Read it after the first live run: the design budget allows the 2 s gap
against the 3,500 s host deadline, and the offline model
(`~/Reports/2026-10-17-policai-source-coverage/pr5-wall-time-model.mjs`)
cannot prove the live wall time.

`hosts` in `data/watch-state.json` holds one record per host seen in the
last 30 days: `seenAt`, `robots` (`fetchedAt`, `status`
`parsed | absent | unreachable`, `allow`, `disallow`, `crawlDelaySec`,
`sitemaps`) or `null`, `backoffUntil`, `backoffStatus` (`429 | 503 | null`),
`backoffCount` and `robotsUnreachableRuns`. The gate loads a record
without `robotsUnreachableRuns` with 0, but `validateWatchState` requires
it; only an unreleased build of the gate wrote such records. The gate and `validateWatchState` share one definition
of the shape (`isHostKey`, `isRobotsRuleList`, `isStoredSitemapList` in
`host-gate.ts`), so a state the gate writes always validates: a host key is
a lowercase DNS name or IPv4 literal with an optional port (an IPv6 literal
is used for the run but not persisted); `Sitemap:` lines are resolved
against the robots.txt URL, kept only when https, deduplicated and capped at
20 (nothing reads them yet); a rule list over 500 patterns or with a pattern
over 1,000 characters is used for the run but persisted as `robots: null`.
`npm run validate:data` checks the shape. A daily run
changes `seenAt` on every host and `fetchedAt` on the refetched ones. For a
67-host state with Drupal-sized robots (60 rules each) QA measured the map
at about 131 KB, adding about 141.5 KB to the file.

Not done here: Firecrawl `map` and `crawl` stay unused (their robots
handling is unverified and `map` sends queries to third-party search
engines); the gate's `refused` map is empty until the structured
`automation` decisions supply `refusedHosts`, so no host is skipped by
decision yet; `npm run audit:sources`, `npm run audit:register` and the MCP
source-ingest reads do not pass through the gate; a 429 on robots.txt
itself is allow-all with no backoff (the fetcher does not surface its
`Retry-After`; the page request that follows observes its own); `admit()`
does not serialise concurrent callers, which the sequential collector never
has; a Firecrawl result without `metadata.statusCode` records no
observation, so a `Retry-After` seen only by Firecrawl is not recorded;
there is no hard run deadline beyond the robots-fetch budget and the wait
budget, so index waits after the wait budget is spent are still bounded
only per request (see Wait budget).

### Failure classes

Each failed row in `meta.json` → `collector.sourceResults` carries
`failureClass` and `failedUrl`. Successful and skipped rows carry neither.
The Editorial Manager reads them after a refusal to decide whether a source
moves to manual tracking. The `error` text, health, thresholds and exit code
do not depend on them.

`classifyFailure` in [`failure.ts`](../src/lib/pipeline/failure.ts) matches
the error message against `FAILURE_CLASSES` in this order and takes the first
match. When the message matches only `other`, it tries the error's `code`, its
`AggregateError` members and its `cause` chain in turn, so Node's
`fetch failed` with an `ECONNREFUSED` or `ECONNRESET` cause gets a class.

`failedUrl` is the URL whose request failed. It is the URL carried on the
`SourceFetchError` (`url`) when there is one, else the first URL in the
message (the Playwright `at <url>` target), else the source URL for an index
failure or the candidate URL for a candidate failure. Every retrieval path
sets `url`: an HTTP status names the URL that returned it, so after a
redirect it is the redirect target, the host that refused, not the URL first
requested. A linked document that fails names the document, not the page that
links it; the link-count and aggregate byte limits name the page. Other transport errors name the request in progress. An HTTP status
message also carries the URL (`HTTP 403 at <url>`), so a candidate's stored
`lastError` still names the refusing host on later runs. Only HTTP status
messages embed the URL in that string. A transport error stored as
`fetch failed` or a timeout string keeps the candidate or source URL as
`failedUrl` on a later rebuild, and may class the row as `other` because the
cause chain is gone.

`failedUrl` is written to a public file, so it is reduced to a public form:
credentials, the query string and the fragment are dropped, the scheme and
host are lower-cased, and a URL with no host is ignored. When a URL is taken
from a message, trailing sentence punctuation (`.,;:!?`) is trimmed and a
wrapping bracket or quote at the end of the candidate is dropped.
Parentheses and apostrophes in the path are kept, so a stored
`HTTP 403 at https://example.gov.au/files/a(1).pdf` rebuilds the full path.
Classification matches each text with URLs removed, so a path token such as
`ENOTFOUND.pdf` cannot change the class; a `SourceFetchError` with `status`
is classed from that status unless the message is `robots_disallowed`. A URL
longer than 2048 characters is reduced to its origin. The URL in an
`HTTP nnn at <url>` message is reduced the same way.

When a source fails more than once in a run, the row records the first
failure: the index, then a document version that exhausted its retries, then
the first failing candidate. The `N candidate retrieval failure(s)` text is
unchanged.

| Class | Matches | Meaning |
| --- | --- | --- |
| `robots_disallowed` | `disallowed by robots.txt` | robots.txt disallows the URL; the host gate refused it before any request. It comes first so a refusal that robots.txt explains is not labelled `identity_refused`. |
| `identity_refused` | `ERR_HTTP2_PROTOCOL_ERROR`, `ERR_CONNECTION_RESET`, `ECONNRESET`, `HTTP 403`, bot-challenge page, `refused the headless browser with a 403` (the gate's breaker) | Heuristic label only. An outage can look the same. A human decides. |
| `rate_limited` | `HTTP 429` | The host asked us to slow down. |
| `host_unavailable` | `HTTP 5xx`, `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_CERT_*`, `ECONNREFUSED`, `ENOTFOUND`, DNS lookup failures | The host could not be reached safely. |
| `not_found` | `HTTP 404`, `HTTP 410` | The URL is gone. |
| `http_error` | any other `HTTP nnn` | Another HTTP error status. |
| `timeout` | `timed out` (`Timed out after`), `Timeout 45000ms exceeded`, `aborted due to timeout`, `ERR_TIMED_OUT`, `ETIMEDOUT`, `host-gate wait budget` | A retrieval or navigation deadline passed, or the run's gate wait budget is spent. Any other text that merely contains `timeout` is not a timeout. |
| `empty` | `Source returned no usable index or feed items`, too few usable items, `Linked policy document <url> returned no document bytes`, no browser response | The source answered with nothing usable. |
| `parse` | no extractable or readable text, unsupported content or document type, linked-document byte validation, DOCX or PDF structure errors | Content arrived but could not be extracted. |
| `other` | anything else | Read `error`. This includes `Source response exceeds N byte limit` and `PDF retrieval did not retain the original document bytes` (an internal retention fault). |

Nothing reacts to a class. A source leaves the health denominator only through
a reviewed change to its `automation`. `npm run validate:data` rejects an
unknown class, a `failedUrl` that is not already in its public form (for
example one with credentials or a query string), either field on a row that
did not fail, and one field without the other. Error rows written before the
fields existed carry neither and stay valid.

## Production automation

Collection runs daily at 19:30 UTC (06:30 AEDT, 05:30 AEST) on the
maintainer's server through
[`ops/collector/policai-collect.sh`](../ops/collector/policai-collect.sh), installed
at `~/.local/bin/policai-collect.sh`. See the
[wrapper runbook](../ops/collector/README.md) for installation, tests and recovery.
Each run holds the existing concurrency lock and:

1. Resets one reusable worktree to freshly fetched main, reinstalling
   dependencies only when the lockfile changed, and runs the full
   `npm run collect` with a bounded deadline and `POLICAI_COLLECTOR_STATE`
   pointing at the collector's host state.
2. Preserves before/after outputs and checks `data/policies.json` even after a
   nonzero exit or timeout.
3. Validates data. Only then does the run's next watch state and outbox
   become the host state.
4. Commits only `data/developments.json`, `public/data/meta.json`,
   `data/watch-state.json` and `data/source-reviews.json`, pushes a unique
   collection branch and opens a ready PR that auto-merges when the required
   checks pass. Older open collection PRs are closed. It never pushes main.
5. Returns failed source health as a failure even when the output was
   published, so the failure alert fires.

With `POLICAI_COLLECTOR_STATE` set, `scripts/collect-run.ts` reads its watch
state from `<dir>/watch-state.json` instead of main's, and replays the
developments and source reviews in `<dir>/outbox.json` whose ids main does not
carry. It writes the next state and outbox to `<dir>/next/`. A failed run
therefore never blocks the next one, and an unmerged PR loses nothing.

The CLI persists source reviews and developments before advancing
`watch-state.json`. Stable review/development ids make a retry idempotent if an
earlier write or the process fails part-way through, so a detected source
version cannot be lost merely because its state write completed first.

**Repository configuration:**

- Main requires a PR with an independent approving review, resolved threads,
  linear history and `lint`, `test`, `build` checks. Retired deploy-key bypass
  advice is not a recovery path. Data merge and editorial register publication
  are separate reviewer decisions; neither is performed by the wrapper.

## Reviewing detections into the register

Detections staged in `data/source-reviews.json` are proposals. An agent
prepares each one completely, and Daniel decides on it with one tap on a
decision card in the Policai Claude project. Approval then publishes.

1. Run the local MCP server (`npm run mcp`).
2. Stage the source with `stage_source_url`, or with `stage_source_capture`
   when the host refuses the collector. Pass the exact record to publish as
   `proposedRecord`, edits included. A capture names who made it honestly:
   `capturedBy: "Claude (agent)"` and `requestedBy: "Daniel Alkurdi"`, never
   an agent signing as Daniel.
3. Call `propose_source_decision` for anything else approval needs: a
   corrected `proposedRecord` (for example `themes` on a new policy, keys from
   `list_themes`), `reviewedDate` for a date the page states but does not
   expose as metadata, `manualExtraction`, `officialSourceUrl` for a
   stage-only lead, or `expectedTargetRevisionHash` after a rebase.
4. Call `show_source_proposal`. Fix and re-propose until `blockers` is
   empty; each entry is the error approval would raise today.
5. Post a decision card (`request_decision`) that shows the current and
   proposed record, the source and who captured it, and the
   `proposalCode`. A typed "go ahead" is not a decision; only a tap is.
6. When Daniel taps Approve, call `record_decision` with the review id, the
   `proposalHash`, `reviewer: "Daniel Alkurdi"`, and the card's link as
   `attestationUrl`. It refuses if the review changed after the card was
   posted, if the reviewer is not on the `POLICAI_SIGNAL_REVIEWERS`
   allowlist, or if a staged browser capture is more than 7 days old. It
   approves with the staged evidence, without a new capture, then publishes.
   Calling it again with the same hash resumes a publication that failed
   part-way.
7. Run `npm run validate:data`, commit, and push (or open a PR).

Server-fetchable sources are fetched again at decision time, and approval
refuses if their fingerprint moved since staging. When that re-fetch is
refused by the host (HTTP 403, HTTP 429, or an equivalent `identity_refused`
/ `rate_limited` failure), approval falls back to the snapshot already on the
review (`sourceEvidence` plus the staged record text) and its notes gain
`RETAINED_SNAPSHOT_APPROVAL_NOTE` (`src/lib/source-ingest.ts`). Other
failures, such as timeouts, 404s and 5xx responses, still refuse.

### Follow watches for federal legislation

Each collection run follows two kinds of register record, each under the watch
id `track:<policyId>`:

- A bill whose `legislative.ref` is an APH bill id, and whose `sourceUrl` is
  that bill's home page. The watch reads the page through the browser with the
  Policai identity, because APH answers plain HTTP clients with a WAF 403.
  `src/lib/legislation/aph-progress.ts` parses the Progress tables and
  committee Notes into lifecycle events.
- An instrument whose `legislative.ref` is a Federal Register title id. The
  watch reads the title record from the register's OData API
  (`api.prod.legislation.gov.au/v1/Titles('<id>')`) over plain HTTP.
  `src/lib/legislation/frl-title.ts` reads registration, a principal
  instrument's commencement, tabling in each House, the end of each
  disallowance window, disallowance and repeal. The API writes 9999-12-31 for a
  date it has not fixed yet; the parser treats that as no date. An amending
  instrument's amendments commence in the versions of the principal it
  amends, so for an amending instrument the watch also searches
  `Titles/Search(criteria='affects("<id>",[amending])')` for the principal
  and reads its `Versions` from the registration day on. A commencement day
  that has come becomes a `commenced` stage. A day still to come is compared
  with the record's `commenced` date, and a difference stages an update that
  moves the date.

Parser fixtures are in `src/lib/legislation/__fixtures__/aph/` and
`src/lib/legislation/__fixtures__/frl/`.

When the register shows a stage the record lacks, or has set or moved a
deadline the record holds (a committee report date or the end of a
disallowance window), the watch stages one update review against the record.
The proposed record carries the merged events and the derived status. The
review's `legislativeUpdate` lists the added stages, the changed deadlines,
a moved scheduled commencement (`scheduledCommencement`), and any stage the parser could not map, such as "Discharged from Notice Paper"
or a disallowance motion that did not pass. A merge that breaks the legal order
is reported in the review, not applied. Unlike a changed direct document, a
stage update keeps the record public while it waits, because the last approved
stage is still true as of its date. It is decided like any other review: a
proposal, then Daniel's decision card, then `record_decision`.

Each record has at most one waiting stage update. A decided update is never
staged again; only a further change on the register stages a new one. A page
or response with no stages counts as a failure in the source health ledger, so
a format change cannot pass silently. A run without a browser skips the APH
watches but still runs the Federal Register ones. Run one watch with
`npm run collect -- --source=track:<policyId>`.

### Policai Signal (Grok Bot)

**Policai Signal** is Daniel’s Grok Bot
(`fa9b5c47-349a-438e-acfc-75055f2d6b8f`). It is another AI agent, so it
cannot approve anything. It alerts Daniel to pending reviews, previews them,
and dismisses new-source leads Daniel rejects. Approval happens only on a
decision card in the Policai Claude project (see above). Product path:
**HTTPS on policai.org**. The bot can reach HTTPS with a masked env secret; it
has **no** Argus SSH, **will not** run a TTY CLI, and **cannot** merge PRs.

#### Bot-facing HTTPS API

Base: `https://policai.org`. Auth header on every Signal call:

```http
Authorization: Bearer $POLICAI_SIGNAL_TOKEN
```

Bot env (masked prompt; never paste into chat): **`POLICAI_SIGNAL_TOKEN`**.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/signal/reviews/<reviewId>` | Dry-run / current state for one review |
| `POST` | `/api/signal/reviews` | Apply `dismiss` |

**Dry-run (harmless first test):**

```bash
curl -sS -H "Authorization: Bearer $POLICAI_SIGNAL_TOKEN" \
  "https://policai.org/api/signal/reviews/<reviewId>"
```

Returns `{ success, dryRun, review, approve, dismiss }`. No write.
`approve` is always `{ allowed: false, reason }`, and the reason says that
Daniel approves on a decision card in the Policai project.
`dismiss.blockers` explains why a review cannot be dismissed.

**Apply:**

```bash
curl -sS -X POST "https://policai.org/api/signal/reviews" \
  -H "Authorization: Bearer $POLICAI_SIGNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reviewId": "<id>",
    "action": "dismiss",
    "reviewer": "Daniel Alkurdi",
    "attestation": {
      "replyText": "<Dan reply verbatim>",
      "chatMessageId": "<message id>",
      "cardId": "<id>",
      "decidedAt": "2026-10-19T05:00:00.000Z"
    }
  }'
```

`action` must be `dismiss`, which runs `rejectStagedSource`. `approve`
returns `approve_not_allowed` (403) and changes nothing. Reviewer must be
allowlisted (`POLICAI_SIGNAL_REVIEWERS`, default `Daniel Alkurdi` and
`Daniel`). `attestation.cardId` must equal `reviewId`.

Attestation is stored in the review's rejection reason as:

```text
Daniel Alkurdi (Signal): <reply verbatim>
chatMessageId: …
cardId: …
decided: <Australia/Sydney> (<ISO>)
relayed by Policai Signal
```

It must not claim TTY typing.

**Idempotent:** dismiss on an already `rejected` review returns
`noop: true` and the current state.

**Errors (bot returns these to Dan):**

| `code` | When |
| --- | --- |
| `unauthorized` | Missing/wrong Bearer token |
| `signal_token_unconfigured` | Host missing `POLICAI_SIGNAL_TOKEN` |
| `not_found` | Unknown review id |
| `approve_not_allowed` (403) | `action` was `approve`; Daniel approves on a decision card instead |
| `invalid_action` / `invalid_request` (400) | Unknown action, or missing fields |
| `dismiss_blocked` / `tracked_record_dismiss` | Tracked-record reviews cannot be dismissed |
| `reviewer_not_allowlisted` | Reviewer not in allowlist |
| `invalid_attestation` | Missing reply / message id / card id |
| `github_token_unconfigured` (503) | Host missing `POLICAI_SIGNAL_GITHUB_TOKEN`; nothing ran |
| `github_unavailable` (502) | `main` could not be resolved on GitHub |
| `main_moved` (409) | `main` target only: `main` moved after the read; retry |
| `github_persist_failed` (502) | Commit, branch or PR creation failed; nothing merged |

Rate limit: 20 POST / 30 GET per IP per minute on `/api/signal/*`.

**Persistence:** Git is the database, and Signal POST never writes the
serving checkout. The service is read-only there (`ProtectSystem=strict`), and
a dirty release checkout would block every later deploy. The route works in
`src/app/api/signal/reviews/route.ts` with `src/lib/signal-git-persist.ts` and
`src/lib/data-overlay.ts`:

1. It resolves GitHub `main` to one base commit with
   `POLICAI_SIGNAL_GITHUB_TOKEN` (repository `POLICAI_SIGNAL_GITHUB_REPO`,
   default `l0cka/policai`).
2. It runs the dismissal inside `runWithDataOverlay`. Every data read comes
   from the file at that commit (contents API, blob API for files over
   1 MB). Writes stay in memory, and no lock file is taken.
3. If the decision is a noop or changes no file, it returns
   `persistence.skipped` and commits nothing.
4. Otherwise it commits only the changed files on top of the base commit's
   tree. A collector commit to `main` since the last deploy is kept, because
   the decision read `main`, not the deployed copy.

Targets:

- `pr` (default): branch `signal/<action>-<reviewId>`. If an open PR already
  has that head, the response returns it with `persistence.existing: true`
  and no new commit, so a rerun is safe. A leftover branch with no open PR is
  force-updated. Dan merges; the bot never merges.
- `main` (`POLICAI_SIGNAL_COMMIT_TARGET=main`): fast-forward `main` without
  force. If `main` moved after the read, the request fails with `main_moved`
  and nothing is written. Send the same request again to decide against the
  new `main`.

`persistence` reports `target`, `branch`, `commitSha`, `prUrl`, `htmlUrl`,
`baseSha` and the committed `files`. The site shows the decision only after
the PR merges (or the `main` push lands) and the host deploy pulls it.

Host requirements: `POLICAI_SIGNAL_GITHUB_TOKEN` must be set, or POST returns
`github_token_unconfigured` (503) before any decision runs. The service needs
outbound HTTPS to `api.github.com`. The production unit is currently
localhost-only, so that is a host change for the maintainer.

#### Pending cards (read-only)

The bot reads pending rows from:

`https://raw.githubusercontent.com/l0cka/policai/main/data/source-reviews.json`

`npm run signal:reviews` reprints the same cards locally. Empty queue:
`No pending source reviews.` `formatPendingSourceReviewCards` in
`src/lib/signal-source-reviews.ts` is pure. Keep `pending_review` rows; order
by `discoveredAt` descending, then `id` in `en-AU`. Each card:

```text
id: <id, one line>
title: <title, one line>
url: <sourceUrl>
jurisdiction: <display name>
change: <one line, from the target id and entry kind>
summary: <analysis.summary, one line, at most 160 characters, ellipsis if cut>
relevance: <analysis.relevanceScore>
discovered: <discoveredAt in Australia/Sydney>
retrieved: <sourceEvidence.retrievedAt in Australia/Sydney, or "not recorded">
```

Omit `jurisdiction` when the staged record has none and
`analysis.suggestedJurisdiction` is empty. Display names are Federal, New
South Wales, Victoria, Queensland, Western Australia, South Australia,
Tasmania, Australian Capital Territory, and Northern Territory. Dates use
`en-AU` with `timeZone: "Australia/Sydney"`. Footer: `1 pending source
review.` or `N pending source reviews.`

`.github/workflows/signal-review-cards.yml` is manual read-only reprint.

**Recovery only (not bot):** `npm run signal:reviews -- apply` can dismiss
or verify on a laptop when HTTPS is down. It cannot approve or publish. The
bot must not be told to SSH to Argus or run `signal:reviews apply`.

One-off publication scripts must also enter through `stageSourceUrl()` or the
controlled `stageSourceCapture()` fallback rather than constructing a review
by hand, so the approval gate always has fresh source fingerprints. Staging a
URL already used by a tracked policy or manual timeline event creates a
revision-bound re-verification review for that record instead of rejecting it
as a duplicate. Supply `targetRecordId` when more than one record of the
requested `entryKind` uses the same official URL. This is the supported path
for refreshing an unchanged record whose editorial review interval expired or
whose first audit fingerprint still needs human comparison. Repeating the
staging operation refreshes an unresolved review in place if the source drifts
again, clears its prior approval, and keeps the policy withheld until the
current evidence is approved. Changed-document reviews likewise update their
existing `targetPolicyId` in place instead of creating another record with the
same source URL.

If an official page is readable in a real browser but consistently blocks the
hardened retriever, use the MCP
`stage_source_capture` tool instead of editing `data/source-reviews.json`.
Supply the displayed page title, normalized semantic `main` text, relevant
official links, a fresh capture timestamp, the human capture reviewer, and the
local path and official URL for every linked canonical document the page
exposes. HTML-only official pages may supply an empty document list; their
semantic page fingerprint remains mandatory. For supplied documents, the tool
only reads regular files from the system temporary directory or the reviewer's
Downloads directory, rejects symlinks and unsupported or oversized payloads,
validates document signatures, fingerprints the exact bytes, and never stores
the local path. Existing records use `targetRecordId`. A new official-source
proposal must instead include a complete explicit `proposedRecord`; the MCP
does not synthesize editorial fields from a browser capture. If a tracked URL
is dead or is a volatile index rather than the instrument, an explicit replacement
additionally sets `replaceTargetSource: true` and supplies `entryKind` (`policy`
or `timeline_event`), `targetRecordId`, and a proposed record that preserves the
target id while using the new official URL. Revision hashes and collision checks
bind that migration to the current canonical record. Timeline replacements store
`targetTimelineEventPreviousSourceUrl` on the review, symmetric with policy
replacements' `targetPolicyPreviousSourceUrl`; neither staging nor approval changes
the canonical record. Publish only after separate human approval with source-backed
dates (use `reviewedDate` for a commencement date not provided by page metadata).

A timeline replacement may adopt its **already-related** policy's canonical source
URL. The proposed event must preserve that `relatedPolicyId`. This narrow exception
also recognises published reviews of that policy, but does not permit collisions
with unrelated policies, other events, pending or approved (unpublished) reviews,
or redirect aliases.
Staging, approval and publication each enforce identity ownership; this does not
relax the policy replacement path.

Staging refreshes an unresolved review of the target in place, preserving its
collector sequence and linked development. Publication updates the event in place,
publishes the refreshed review, and promotes its development. Older unresolved
reviews become `rejected` with a supersession reason and their developments are
dismissed. Older published timeline reviews remain published history; their
associated developments are dismissed. Historical old URLs are valid only when a
published replacement for the same target links the previous URL to the current
one. An approved replacement may match an already-written canonical record during
partial-publication recovery, but does not authorise historical old-URL reviews
until publication completes.

Check a replacement with `npm run validate:data`; exercise the handler and validator
fixtures with:

```bash
npx vitest run src/mcp/timeline-source-replacement.test.ts src/lib/timeline-source-replacement-validation.test.ts src/lib/source-ingest-workflow.test.ts src/lib/validate-data.test.ts src/mcp/tool-handlers.test.ts
```

A browser-captured review remains subject to the normal gates.
`record_decision` approves and publishes against the staged capture, and
refuses one more than 7 days old. Re-staging with a fresh capture is the only
way to refresh it, and it clears the proposal and any decision, so a changed
page needs a new decision card.

Dismissals: reject the staged review and set the matching development's status
to `dismissed` with a `dismissalReason`. Publishing a collector review promotes
the matching development and attaches its verified record relationship.
Dismissed leads remain in Git history but public reads hide them.

Collector-created reviews include the matching development snapshot. This is
the recovery boundary for the unavoidable multi-file Git write: if the review
is persisted but `developments.json` is not, the next run recreates the stable
development before applying URL deduplication.

A changed-source review for an existing policy cannot be rejected, because the
source is already known to differ from the last verified evidence. If the
change is immaterial, propose the unchanged/corrected policy draft and
decide it on a card; this refreshes the evidence hash and review metadata.
If the exact changed version is image-only or otherwise not machine-readable,
`propose_source_decision` accepts a controlled `manualExtraction`, which approval uses only after
automatic extraction fails. Supply the full reviewed `proposedRecord`, OCR or
manual-transcription method, title, extracted text, and notes. Approval binds
the transcription hash and reviewer identity to the still-matching staged
source fingerprint before publication.

Approval never infers date provenance from the presence of a date in an
editor-supplied draft. A timeline date or a policy's primary `published` date
may use matching date and precision metadata extracted from the official
source. Any other primary date requires a `reviewedDate` object containing the
exact date, precision, and substantive inspection notes. Policai stores the
reviewer, review time, notes, and current source fingerprint with that date;
non-primary dates are not automatically stamped with the primary source
evidence.
New policy and timeline approvals also reject IDs already owned by canonical
records, preventing an approved draft from withholding unrelated public data.

Publication side effects are deliberately idempotent. Before committing a
publication, the tool checks approval freshness, the live source fingerprint,
and any target-record revision, then writes the canonical policy or timeline
record and durably marks the review `published`. That terminal review status is
the public transaction boundary. Development promotion and collection
freshness are recoverable side effects written afterwards, so a call that
fails in that final phase may already have made the verified canonical record
public. Retrying a terminal `published` review repairs only those side effects;
it does not reopen or revalidate the committed editorial decision. If failure
occurs before the terminal status is durable, retrying the still-`approved`
review repeats the freshness and live-source checks. Later source changes must
enter a new re-verification review rather than being folded into recovery.

## Adding or fixing a source

Edit [`src/lib/pipeline/sources.ts`](../src/lib/pipeline/sources.ts). Each source
needs an id, name, jurisdiction, category (`government | regulator | court`),
URL, kind (`html-index | rss | document`), schedule (`daily | weekly`), and
automation mode (`automatic | manual`). Prefer dated index/news pages or RSS
feeds for discovery and primary instrument pages for verification. For a feed
whose titles never carry the AI signal, set `bodyRelevance` (see
Classification) and choose `minAiMentions` from a probe of real items, not a
guess. Verify with:

```bash
npm run audit:sources -- --source=<id>
npm run collect -- --dry-run --source=<id>
```

A new `html-index` or `rss` source also sets `admittedAt` (YYYY-MM-DD).
Its first completed check marks the items currently listed as seen and emits
no developments; the run log names each seeded URL so the admission PR can
list them. Developments start from the second check. Without `admittedAt`, the
first check treats up to `maxItemsPerSource` back-catalogue items as new.
`document` sources need no seeding because their first check only records
a fingerprint baseline.

## Troubleshooting

- **Publication fails with `GH013`**: inspect the run's branch and the
  applicable rules. The wrapper only pushes `automation/collection-*`, never
  main. Do not add a bypass actor. The host state was already promoted, so the
  next run's PR carries the same findings once the rules are fixed.
- **A source keeps failing** — check `meta.json` → `collector.sourceResults`.
  If the endpoint consistently requires a browser, keep it enabled but move
  it to manual tracking with a reviewed decision (below). Do not count a challenge page
  as coverage and do not disable an authoritative source merely because it
  cannot be automated.
  Every due automatic source counts in the health denominator, including a
  source that is known to be blocked, so one persistent refusal keeps the run
  `degraded` and `lastHealthyAt` stale. Move such a source to manual
  tracking (which drops it from the denominator) rather than excluding it
  from the count. `automation` is then a decision record, never a bare flag:
  `{ mode: 'manual', because, decision, since, decidedBy, evidence }`, where `because` is `identity_refused`, `bot_blocked`,
  `robots_disallowed` or `not_found`, and `decision` is `manual` or
  `await_allowlist` (only where an allow-list request has a written reply).
  `validate:data` rejects an incomplete record. The record carries no review
  cadence of its own: how often an editor must check a manual source by hand
  still follows its `schedule` (`reviewIsCurrent` in
  `src/lib/source-monitoring.ts`). Only a reviewed PR changes
  it; the collector never moves a source itself. A result already stored for that id, including
  one recorded while it was still automatic, is left out of the public
  automatic count and does not keep the run degraded (`publicAutomaticCollectionMeta`
  in `src/lib/collection-coverage.ts`, applied by `getCollectionMeta` and by
  the committed `public/data/meta.json`). `accc-rss` (HTTP 403 from the host's
  access-denied page) and `wa-ai-policy` (the linked finance.gov.au framework
  PDF resets the connection) were moved for this reason (#304, #389); each
  decision's `evidence` carries the measurements.
- **Adding a source or directory record** — give it the `bodyId` of its
  publishing body in `data/bodies.json`. A body has an id, name,
  jurisdiction, tier (`A`, `B` or `C`), the hosts it publishes on, and a
  scope decision; the Editorial Manager owns scope and tiers.
  `validate:data` fails on an unknown `bodyId`, a source or directory
  website whose host is not one of its body's hosts, a jurisdiction that
  differs from the body's, a directory name that is neither the body's
  name nor the body's name followed by ` - ` and a part of it, and a
  jurisdiction with no tier A body. Add a new publisher to `bodies.json`
  in the same PR. `diser` and `disr` are two directory records for one
  body.
- **Finding what is not watched** — `npm run report:watch-coverage` (add
  `-- --json` for the raw report) counts, per jurisdiction and tier, the
  in-scope bodies with a working automatic source or an enabled manual
  source, and lists the gaps, every decided block with its last manual
  review, refusals awaiting a decision and linked documents skipped on a
  refused host. A body is covered automatically when any of its automatic
  sources is being reached; a source the per-source ledger has not
  recorded yet counts from its last completed check. Out-of-scope bodies
  are left out and unassessed ones are counted. `/status` shows the same
  report (`watchCoverage` in `src/lib/watch-coverage/report.ts`).
- **Finding sources for a body** — `npm run discover:sources -- --body=<id>`
  reads the body's robots.txt `Sitemap:` lines (or `/sitemap.xml` when
  there are none) and the RSS or Atom feeds its home page links (or
  `/rss.xml` and `/feed` when it links none), then
  prints ranked proposals with sample titles and marks any already
  watched. Every request goes through the host gate under the declared
  identity and the official-host allow-list, so robots.txt, pacing and
  decided blocks hold; a disallowed section is listed as skipped, never
  proposed. It uses plain HTTP only, so hosts that reject non-browser
  clients return nothing. It writes nothing: admit a proposal through a PR
  that adds the source with its `bodyId` and `admittedAt`.
- **A host refuses the declared identity** — record it once, on the manual
  decision of the source that observed it, with `because: 'identity_refused'`.
  `refusedHosts` in `src/lib/pipeline/sources.ts` derives the refused hosts
  from those decisions, and the host gate never requests them: a linked
  document or candidate there is listed under `skippedLinked` on the
  source's result row, with the deciding source, and is not a failure.
  A skipped candidate is marked `failed` in `watch-state.json` so the next
  run does not request it again. Reversing the host decision does not revive
  it: clear that candidate's `seen` entry in the same PR if it should be
  collected.
  `validate:data` fails while an automatic source sits on a refused host, so
  one host decision cannot be half-applied. Record `bot_blocked` instead
  when the page host itself accepts the collector and only a linked host
  refuses, so the page host is not marked refused (`wa-ai-policy` until
  www.finance.gov.au has its own decision).
- **An HTML source reports no coverage** — only links inside recognised
  publication/result containers count as index entries. Navigation, footer,
  homepage, login, and soft-error links do not make a source healthy; inspect
  the source markup and add a durable extraction rule if its real entries are
  not recognised.
- **A valid feed returns zero items** — a structurally valid RSS/Atom feed may
  be legitimately empty. Sources whose official index is expected to retain
  current entries set `minimumItemCount`; a zero-item response for those
  sources is degraded coverage, not a successful fresh check.
- **Nothing new detected** — expected on most days; the feed only grows when monitored pages change. Check `watch-state.json` to confirm URLs are being seen.
- **A candidate cannot be retrieved** — retryable failures remain pending for
  at most five attempts. HTTP 404, bot challenges, unsafe redirect targets, and
  exhausted retries become terminal `failed` watch-state entries so they do not
  consume collection capacity forever.
- **A feed links away from an official host** — the candidate is ignored before
  it enters watch state. Redirects are checked hop-by-hop (except inside a
  Firecrawl scrape, where only the final URL is checked; see the Firecrawl
  table above), and production DNS
  resolution must return only public network addresses. The validated address
  is pinned to the TLS connection and checked after connection; each validated
  address is tried within the shared deadline. Each retrieval has one deadline
  across redirects and a 20 MiB response limit. The live source audit applies
  the same non-root-to-homepage redirect rejection as scheduled collection.
- **A verified source changed** — run
  `npm run audit:register -- --write-evidence`; the record is marked `stale`
  and withheld publicly until reviewed. Re-running the audit never restores
  verification automatically. Register-audit retrievals use a generous
  per-attempt timeout (45s, overridable with `AUDIT_REGISTER_TIMEOUT_MS`) and
  exactly one retry for transient failures (timeouts, DNS/socket errors, HTTP
  408/429/5xx) with a short backoff; client errors such as HTTP 403 are never
  retried, and a retried-then-failed source still reports `retrieval_failed`.
- **A changed direct document is unreadable** — the hash mismatch still stages
  a pending update review immediately, so the existing policy is withheld. The
  previous readable fingerprint remains the baseline and extraction is retried.
- **A document changes again before an extraction retry** — the retry remains
  attached to its original hash. The newly served hash receives a separate
  versioned review; bytes from one revision are never attributed to another.
- **A verified record has no stored fingerprint** — the same audit records the
  first fingerprint but marks the record `stale`; an editor must compare the
  current source and republish it. The audit exits non-zero while any baseline
  is missing.
- **A record has not been reviewed for 90 days** — it stays public, labelled
  "Review due", with its verification projected as `stale` until an editor
  re-verifies and republishes it. `/status` lists due and overdue records;
  `npm run check:freshness` fails when the overdue count exceeds
  `data/freshness-budget.json`.
- **A verified record's secondary structured date has no source evidence** —
  historical records are tolerated within a lower-only budget ratchet:
  `npm run validate:data` fails when the count of verified secondary dates
  without matching source publication metadata or `reviewedDate` evidence
  exceeds `maxUnevidencedSecondaryDates` in `data/record-evidence-budget.json`.
  Lower the budget as evidence is added; raising it needs a stated reason.
- **A manual review timestamp is in the future** — validation fails outside the
  five-minute clock-skew allowance, and coverage never counts it as current.
- **Validation fails in CI** — run `npm run validate:data` locally; it prints every structural error with the offending record id.

Stage-only non-government leads remain pending until an editor supplies
`officialSourceUrl` and an explicitly reviewed replacement `proposedRecord` to
`propose_source_decision`. Approval retrieves and extracts that official source
again, replaces the discovery evidence, and only then validates the replacement
record. Publishing synchronizes the linked development from the reviewed record
and marks its assessment as editorial.

If an editor manually stages an official URL that already exists as a detected
radar item, the review retains that development id and snapshot. Publishing
promotes it and rejection dismisses it, including after partial-write recovery.
