# Authoritative Policai Refactor

Started: 16 July 2026

## Baseline findings

- [x] The existing lint, test, validation, and build suite passes.
- [x] Invalid JSON is silently replaced with fallback data.
- [x] Writes are not atomic.
- [x] Collector drafts invent `effectiveDate` from detection time when the
  source supplies no date.
- [x] Pending reviews can be published without an explicit approval gate.
- [x] High-confidence AI classification is conflated with trust, while model
  and prompt provenance are discarded.
- [x] Heuristic detections are public but are not staged under the default
  review threshold.
- [x] New URLs are marked seen before reliable retrieval and verification.
- [x] The latest scheduled run reported success although 14 of 17 due sources
  failed.
- [x] Several source definitions use direct instrument pages as generic link
  indexes, producing noisy historical “developments”.
- [x] The home page presents unverified developments without a trust label.
- [x] Court and agency pages fetch Policai's own API from Client Components
  instead of receiving server-loaded data.
- [x] Eight of 38 policy records have no recorded review date.
- [x] Existing review metadata cannot record the evidence that was checked.

## Workstreams

### Canonical data safety

- [x] Make canonical JSON reads fail on malformed content.
- [x] Make JSON writes atomic.
- [x] Add runtime validation for every canonical/state file.
- [x] Add verification metadata and migrate existing records.

### Collection and discovery

- [x] Separate retrieval, extraction, assessment, and orchestration modules.
- [x] Add retryable candidate state instead of an unconditional seen set.
- [x] Make partial-write development recovery respect terminal review state.
- [x] Add per-source run results and coverage-based health.
- [x] Fail automation when coverage is below the accepted threshold.
- [x] Add document-change monitoring for instrument pages.
- [x] Extract text from official PDFs before analysis or review staging.
- [x] Replace known broken URLs and prefer official feeds or primary documents.
- [x] Record assessment provider, model, and prompt version.
- [x] Hash linked instrument bytes so same-URL replacements are detected.
- [x] Validate semantic HTML readability and extensionless document signatures.

### Editorial verification

- [x] Make staged policy records drafts with incomplete fields allowed.
- [x] Add an explicit approval step with reviewer and evidence metadata.
- [x] Re-fetch official evidence at approval and reject post-staging changes.
- [x] Guard update publication against concurrent editorial revisions.
- [x] Refuse to publish unapproved or structurally incomplete drafts.
- [x] Stamp canonical verification metadata on publish.

### Public presentation

- [x] Separate verified developments from the unverified radar.
- [x] Show record verification state, date, and source evidence.
- [x] Show collection coverage and degraded/failed health.
- [x] Move internal page reads to Server Components.
- [x] Revalidate time-dependent pages before verification expiry can drift.
- [x] Add a public methodology/trust page.

### Data verification

- [x] Audit all enabled watch sources and replace unsuitable strategies.
- [x] Audit every canonical policy against its official source and explicitly
  stale/withhold records that lack reproducible fingerprint evidence.
- [x] Resolve the eight records with no recorded review.
- [x] Reconcile duplicate/noisy developments created by initial hub crawls.

## Completion gates

- [x] Focused tests cover each trust invariant.
- [x] `npm run check` passes.
- [x] A real source audit completes with actionable coverage reporting.
- [x] The local MCP review workflow passes protocol-level smoke tests.
- [x] The site clearly distinguishes verified records from automated leads.
- [x] Final review finds no high-priority architecture or trust defects.
