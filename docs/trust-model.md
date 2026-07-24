# Policai Information Trust Model

Policai should help professionals find relevant material quickly without
blurring the difference between an official instrument, an automated lead, and
Policai's own analysis.

## Trust tiers

### 1. Verified register record

A register record is verified only when:

- the source is an official primary source or the official instrument itself;
- the title, jurisdiction, issuer, instrument type, status, and displayed date
  have been checked against that source;
- summaries accurately distinguish source statements from Policai analysis;
- a reproducible SHA-256 fingerprint binds the record to the source version
  the editor reviewed;
- the reviewer and review time are recorded; and
- the record passes structural and cross-reference validation.

Verification is point-in-time. The editorial review interval is 90 days,
measured from `verification.checkedAt`. Public projections treat older
verification as stale even if the canonical record has not yet been rewritten.
Rendered public pages revalidate at least hourly so a statically generated view
cannot continue displaying a record after that interval expires.
A later automated fingerprint check is recorded separately as
`verification.lastSourceAuditAt`; it does not renew the editorial review.
A record also becomes stale when its source content changes or its source is
confirmed missing with an HTTP 404 or 410 response, redirects to a homepage, or
leaves the official-source allow-list. A timeout, bot challenge, or access
denial is recorded as a retrieval failure for manual follow-up rather than
treated as proof that the official source no longer exists.
Public register and timeline reads withhold non-verified records until that
state is resolved.

For direct documents monitored by the collector, a changed content fingerprint
creates an update review linked to the existing policy. While that review is
pending or approved, public reads withhold the target policy even though the
last verified version remains in Git. Publishing updates the same policy id;
the review cannot be rejected because the source is already known to differ.
An immaterial change is resolved by approving and publishing the existing
content with refreshed evidence and reviewer notes. An older review cannot be
published after a newer source version has been staged.
The pending update review is created from the hash mismatch before content
extraction. If the new document is corrupt, empty, or image-only, the previous
fingerprint remains the retry baseline but the public policy is still withheld.
Each retry is bound to the captured content hash. If the mutable URL serves a
newer revision, that revision receives a separate review and the older retry is
not processed with mismatched bytes.
Transitions are sequenced rather than deduplicated forever by byte hash. A
mutable document that moves from version B to C and later returns to B creates
three distinct review transitions; only retries of the same uninterrupted
transition reuse an id. Older pending transitions are dismissed when a newer
version is observed. Approval-time re-fetches do not change this immutable
ordering, so re-approving an old version cannot supersede a later transition.
If an unreadable changed version returns to the last verified fingerprint, the
collector creates an ordered baseline-reversion review instead of suppressing
the transition. The obsolete changed-version candidate is retired, but the
policy remains withheld until an editor confirms and publishes the reversion;
that publication then rejects the older active update review.
If extraction of a changed document exhausts its retry budget, later scheduled
checks continue to report that source as failed and requiring manual review;
the collector never converts the unresolved version into healthy coverage.
An editor can resolve an image-only or otherwise unreadable changed document
through an explicit OCR/manual-transcription approval. The workflow still
re-fetches and hash-matches the staged source version, requires a complete
reviewed replacement record, and records the extraction method, editor, time,
notes, character count, and transcription hash. It never treats arbitrary
binary bytes as automatically extracted text.
That approval clears any exhausted collector error and makes the reviewed
fingerprint the next comparison baseline, while the transition remains
unresolved until publication. If the live source returns to the canonical
fingerprint first, the collector stages a baseline-reversion review. A later
persisted review can advance the operational baseline only by source-version
sequence, so recovery cannot roll the collector back to an older document
version.
Publication is retryable: the canonical record is written while the active
review still withholds it, and the source review's terminal `published` status
is the public transaction boundary. Matching-development promotion and
freshness metadata are recoverable side effects. Public reads derive the
development state from terminal reviews, so a failed side-effect write cannot
expose a rejected lead or hide a completed editorial disposition while repair
is pending.
The whole read-check-write publication transaction is serialized by a
cross-process repository lock shared with other editorial mutations,
collection, and evidence-writing audits. Atomic file replacement prevents
torn JSON, while this wider lock prevents concurrent writers from silently
losing a canonical record or publication side effect.
If a canonical write succeeds before a later side effect fails, the exact
approved record remains withheld while the review is still active. A retry
detects that already-written revision but still requires a current approval
and a fresh source fingerprint match before making the review terminal. An
expired approval or changed source leaves the partial record withheld. The
review can be re-approved because collision checks exempt only the canonical
policy or timeline revision proven to be that review's own partial write. The
refreshed approval captures the partial revision hash and updates it safely.
Publication re-fetches the official source and requires its composite content
fingerprint to still match the evidence captured at approval. A source that
changes in the approval-to-publication interval must be re-approved before the
review can become terminal and public, including during partial-write recovery.
Update reviews capture a hash of the target policy's editorial revision when
their draft is staged. If the policy changes before approval, the reviewer must
provide an explicitly reviewed replacement draft rebased on the current
record; a stale staged snapshot cannot silently become the approval. Approval
then captures the current target revision again. Publication proceeds only
when the canonical policy is still that approval baseline or already equals
the approved result; concurrent editorial changes require a rebase and new
approval. A newer automated source-audit timestamp is preserved
because it is operational evidence rather than an editorial field. The
approved editorial `updatedAt` is written unchanged, so a retry can recognize
the exact revision it wrote before a later publication side effect failed.
Revision comparison also normalizes response-time evidence such as retrieval
time, redirect destination, ETag, and Last-Modified while retaining canonical
URLs, editorial source dates, content fingerprints, and any manual extraction
provenance. Changing an OCR/transcription method, editor, timestamp, notes,
text hash, or character count therefore changes the guarded editorial revision.
The same normalized policy and timeline revision hashes identify canonical
records left by partial writes. Retrieval time, redirect, ETag, Last-Modified,
and automated audit time cannot accidentally remove the active-review
withholding guard.
Promotion also replaces the development title, summary, jurisdiction, source
URL, publication date, and assessment provenance with the approved editorial
record. A machine-generated summary cannot become verified merely because the
lead status changed.

The policy register, editorial timeline, and agency files live outside
`public/`. Their open JSON routes use the same public data-service projection
as the rendered site, so direct asset access cannot bypass verification or
changed-source withholding.

The developments feed and derived framework visualization also live outside
`public/`. Dismissed developments are omitted from the public route, and the
framework page/artifact is unavailable whenever its related policy is withheld
or no longer verified. The framework's own verification must cover the current
policy revision; re-verifying the policy does not automatically bless an older
derived artifact. While withheld, the framework page returns an explicit
re-verification notice rather than advertising a broken route or stale map.
Public developments retain a register relationship only while that policy is
itself publicly visible, preventing a promoted lead from linking to a withheld
record. A formerly verified development is also projected as stale while its
related policy is withheld for re-verification. Agency policy associations are
likewise exposed only for verified
agencies and currently public policies. A public superseded policy also loses
its `supersededBy` reference while the successor is withheld, so the public
projection never emits a dangling relationship to a non-public record.

### 2. Unverified development

An unverified development is a lead discovered on an official source. It may be
useful and timely, but it has not passed editorial verification. The site must
show:

- the official URL and source catalogue entry;
- when it was detected and, when available, published;
- whether it was found by the current heuristic rules or a legacy assessment;
- retrieval and assessment provenance for new detections; and
- an unambiguous “Needs review” state.

A relevance score is not a verification score.

### 3. Rejected or dismissed lead

Irrelevant, duplicate, misleading, or superseded leads remain in operational
history where useful, but are not shown as current public developments.

## Source policy

- Prefer the official instrument page or document.
- Treat source identity consistently. Policai strips fragments, recognised
  tracking parameters, and non-root trailing slashes and sorts remaining query
  parameters before deduplication or storage. Meaningful query parameters are
  retained. The same identity is used for policies, timeline records, staged
  reviews, developments, linked evidence, and collector state.
- Official indexes, feeds, and sitemaps are discovery sources; the linked
  instrument is the verification source.
- Non-government material can identify a lead but cannot directly support a
  verified register record. Explicit stage-only analysis may retrieve a
  non-government public HTTPS page, but approval still requires replacement
  with an allow-listed official source. Every approval re-fetches and extracts
  the official URL. An unchanged canonical URL must match the fingerprint
  captured when the review was staged; otherwise the source must be reviewed
  again. Replacing a discovery or canonical URL also requires an explicitly
  reviewed replacement record. Third-party or stale titles, summaries, dates,
  and claims are never relabelled as freshly verified merely by approving the
  review.
- Redirect destinations are recorded and checked so a once-official URL cannot
  silently become unrelated content. A non-root document that resolves to the
  site homepage is rejected at the shared retrieval boundary for collection,
  audits, and source ingestion. Register audits treat this permanent destination
  mismatch like a missing source and mark the record stale.
- Manual catalogue checks require named human attribution, retained source
  evidence, and substantive inspection notes. Refreshing a check merges new
  evidence with prior title, publisher, redirect, and fingerprint fields;
  sparse refreshes cannot erase provenance or count as successful coverage.
- Collector retrieval accepts only HTTPS on allow-listed official hosts,
  validates every redirect before following it, and rejects hosts that resolve
  to loopback, private, link-local, documentation, or multicast address space.
  The validated public address is pinned to the TLS socket and checked again
  after connection, closing DNS-rebinding gaps. Node address-family
  autoselection is disabled for the pinned socket so the custom lookup cannot
  be reinterpreted as a multi-address resolver. A single total deadline covers
  DNS resolution, redirects, per-address attempts, and response retrieval;
  declared or streamed responses above 20 MiB are rejected.
  This prevents discovered links from becoming arbitrary or unbounded
  server-side fetches.
- PDF and HTML sources are both acceptable. The retrieved content type and a
  stable content hash are retained. Supported document byte signatures take
  precedence over a misleading HTML or XML content type, so binary revisions
  are always fingerprinted from their exact bytes. For an HTML instrument
  page, relevant linked PDF, Word, and RTF documents are retrieved and hashed
  too; their
  evidence is stored and folded into the page's composite fingerprint. A
  same-URL document replacement therefore invalidates the stored evidence even
  when the landing-page HTML does not change. File signatures are checked
  against the expected document format before those bytes are accepted, so an
  access-denied or placeholder payload cannot become trusted evidence merely
  through its URL or response header. Extensionless download endpoints are
  accepted only when the retained bytes identify a supported document format.
  Extraction reuses that same byte-signature classifier, so an extensionless
  DOCX or PDF served as generic octet-stream is not accepted by retrieval and
  then incorrectly rejected by content extraction.
  Ordinary HTML links are not inferred to be attachments merely because their
  anchor text says “policy document”: discovery requires a binary extension,
  declared document type, `download` attribute, or explicit
  download/attachment path. Every attachment also requires policy/instrument
  relevance in its link context, so an unrelated annual report in the same
  page body cannot alter the policy fingerprint or source health.
  Attachment responses remain in memory for extraction during the same pass;
  every linked instrument must be readable before its landing page is treated
  as healthy, and extracted attachment text participates in assessment.
- A successful HTTP response is not sufficient evidence of readable content.
  Empty semantic `main`/`article` content and PDFs without extractable text fail
  source coverage and require retry or manual review. Navigation, cookie
  banners, headers, and footers cannot satisfy the readability threshold.
  DOCX text is extracted from its validated document XML. Legacy DOC, RTF,
  image, corrupt archive, and generic octet-stream payloads require verified
  manual transcription; a readable landing page cannot mask their failure. A
  recognizable HTML signature is required when a server omits or misstates the
  textual content type.
- A discovery index is healthy only when it exposes allow-listed official links
  in explicit article, result, listing, news, publication, or media entry
  structures. Generic lists, utility links, and external-only results do not
  count as source coverage. Publication-date metadata consumed by extraction,
  including `datePublished`, is also part of the stable HTML fingerprint so a
  source-backed date correction triggers re-verification.
- Source dates retain their stated precision. A month-only or year-only source
  date is stored with an anchor date for ordering plus explicit `month` or
  `year` precision, and the UI does not display an invented day. Verified
  policy and timeline records cannot omit that precision, and their anchor
  dates are validated consistently. Calendar validation uses an exact UTC
  component round-trip, so impossible dates cannot be normalized into a
  different month by JavaScript.
- HTML fingerprints use semantic `main`/`article` content, relevant instrument
  targets and contents, and stable publication metadata. Site-wide navigation, footers,
  stylesheets, icons, and unrelated metadata are excluded so routine CMS churn
  does not trigger false re-verification. Semantic headers inside the article
  or main content remain part of the fingerprint because titles, dates, and
  instrument links commonly live there.
- HTTP 200 browser challenges are retrieval failures, not successful source
  checks, including HTML challenges served with a missing or generic binary
  MIME type.
- When an official source consistently blocks the hardened retriever, the
  local MCP can accept an explicit browser capture.
  This is not a visual-check exception: the capture must include the normalized
  semantic page text, relevant official links, a fresh timestamp, reviewer
  attribution, and the locally downloaded bytes for every canonical instrument
  linked by the page. An HTML-only page may have no linked instrument; in that
  case its semantic page hash is the complete capture fingerprint. When
  documents are present, Policai validates file signatures and size limits,
  hashes the page and exact document bytes into one composite fingerprint, and
  persists the hashes and provenance without retaining local file paths.
  Approval and publication each require a fresh matching capture; a changed
  page or document therefore returns the record to review. Existing records
  remain revision-bound. New records require a complete explicit proposal, and
  replacement of a dead tracked URL requires a separately declared source
  migration that preserves the target id and passes identity-collision checks.
  Browser capture cannot bypass stage, human approval, or the publication gate.

## Date policy

Policai must distinguish, where relevant:

- publication or issue date;
- commencement or effective date;
- approval date;
- amendment date; and
- supersession or repeal date; and
- consultation close date.

Collector drafts must leave unknown dates incomplete. Discovery time is never a
substitute for an instrument date. Date-only values are rendered as calendar
dates rather than UTC instants, so the displayed day, month, and year do not
change with the reader's timezone.

Generated timeline events use a supersession or repeal label only when the
record contains the corresponding structured lifecycle date. A policy's current
status is not backdated to its original publication date.

## Summary policy

- `description` is a concise factual description suitable for the register.
- `content` records verified key details, not a wholesale copy of the source.
- `aiSummary` is clearly labelled as machine-assisted analysis even after a
  reviewer checks it.
- Material obligations, scope, commencement, status, and supersession claims
  should be traceable to the official source.

## Freshness policy

The site reports two separate concepts:

1. **Collection run time:** when automation most recently attempted its checks.
2. **Collection coverage:** how many due sources were successfully checked.

A run with poor coverage is failed or degraded, even if the workflow process
completed. Editorial freshness is reported separately from automated
collection.

Sources that cannot be checked reliably by a non-browser collector remain
enabled in the catalogue with `automation: manual`. Their current review,
unavailability, and evidence are recorded in `data/source-monitoring.json`;
they are not counted as automatic successes.

`npm run audit:register` compares current source fingerprints with stored
evidence. `--write-evidence` records a missing first fingerprint but marks the
record stale because automation cannot prove that the retrieved content is the
same content an editor originally reviewed. Changed records and
confirmed-missing sources are also marked stale. A changed observation never
replaces the last editorially verified fingerprint; later audits and the
collector continue comparing against that trusted baseline. The audit never
promotes a record back to verified.
Records migrated without a reproducible fingerprint are likewise stale and
withheld until a successful fingerprinted editorial re-verification. Current
availability in a browser is not by itself a substitute for canonical hash
evidence; the controlled browser-capture workflow above is acceptable because
it produces and later rechecks that evidence.
Canonical migrated records in that state are explicitly labelled `stale`, and
`npm run validate:data` rejects any future record labelled `verified` without a
valid SHA-256 source fingerprint.
The collector applies the same rule on its first direct-document check: a
verified record without a fingerprint creates a baseline-missing update review
instead of silently trusting the currently served bytes.

Collector-created source reviews retain their matching development snapshot.
If one JSON write succeeds and the next fails, the following run reconstructs
the missing development and source transition by stable id before collection
continues. A recovered `pending_review` remains pending so unreadable-document
extraction retries and failed source-health reporting are not silently lost.

## Required publication gates

Before a source review can enter the register:

1. the source is retrieved successfully;
2. the draft contains a source-backed date rather than a generated date;
3. the draft is explicitly approved by a reviewer;
4. verification metadata is attached;
5. that verification is still inside the 90-day editorial interval at
   publication time; an expired approval must be re-approved against the
   official source;
6. duplicate and cross-reference checks pass; and
7. discovery, retrieval, approval, and publication timestamps are
   chronological; and
8. the canonical data validation suite passes.
