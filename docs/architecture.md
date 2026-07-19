# Policai Architecture

Policai is a Git-native publishing system for Australian AI policy information.
The deployed Next.js application is a read-only presentation layer over
versioned JSON. Collection and editorial tooling run outside the deployed site
and publish changes through Git.

## Architectural boundaries

```text
Official sources
  -> source catalogue
  -> discovery + retrieval
  -> machine assessment
  -> review queue
  -> editorial approval
  -> canonical register
  -> static site + read-only API
```

The boundaries are deliberately strict:

1. **Discovery is not verification.** A keyword or model match may create a
   radar item or review proposal, but it does not make a record authoritative.
2. **The developments feed is not the policy register.** Developments may be
   unverified and must say so. Register records require explicit editorial
   approval.
3. **Machine output is evidence, not fact.** Model summaries, classifications,
   and inferred fields retain their method and model provenance. They are never
   labelled as verified merely because confidence is high.
4. **Dates are sourced, not invented.** If a publication, issue, commencement,
   or effective date cannot be established from an official source, the draft
   remains incomplete.
5. **Collection freshness includes coverage.** A completed run is not a
   successful run when most due sources failed. Health reporting records both
   the run time and the proportion of sources successfully checked.
6. **Canonical reads fail loudly.** Missing optional state may use an explicit
   default. Invalid canonical JSON is an error and must never silently render as
   an empty dataset.
7. **Canonical writes are atomic.** JSON is written to a temporary file and
   renamed so an interrupted process cannot leave a partially written database.
8. **Data transactions are serialized.** All MCP mutations, non-dry-run
   collection, evidence-writing register audits, and the complete publication
   workflow share a cross-process lock. Atomic renames prevent torn files; the
   transaction lock prevents lost updates. Lock metadata is prepared before an
   atomic hard-link acquisition, healthy waiters wait indefinitely, and only a
   process proven terminated on the same host can be reclaimed. An exclusive
   reclaim marker prevents competing takeovers, and each canonical replacement
   verifies the active ownership token before writing.

## Data ownership

| Data | Owner | Publication rule |
|---|---|---|
| `data/policies.json` | Editorial register | Explicitly approved; public route applies verification and update-review filters |
| `data/developments.json` | Automated radar + editorial annotations | Public route hides dismissed items and leads linked to terminal rejected reviews |
| `data/dta-ai-policy-framework.json` | Editorial visualization artifact | Public page/route requires its related policy to remain publicly verified |
| `data/timeline.json` | Editorial chronology | May await review; public route emits only verified records |
| `data/agencies.json`, `data/commonwealth-agencies.json` | Editorial directory | Public route removes unverified claims and narrative |
| `public/data/meta.json` | Collector/editorial operations | Records coverage and health, not just timestamps |
| `data/source-reviews.json` | Review workflow | Drafts only; never displayed as canonical facts |
| `data/watch-state.json` | Collector | Retry and source snapshot state |
| `data/source-monitoring.json` | Editorial operations | Manual coverage for sources that cannot be collected reliably |

## Application architecture

- Server Components read repository data directly through
  `src/lib/data-service.ts`.
- Client Components receive serialisable props and own only interactive state.
- Route handlers exist for the public JSON API, not as an internal data layer
  for server-rendered pages.
- Editorial policy, agency, and timeline files live outside `public/`;
  `/data/*.json` handlers expose their sanitized public projections.
  Those compatibility routes are force-static with hourly revalidation, so
  verification expiry is reflected without turning former CDN assets into
  unbounded per-request file reads.
- `src/lib/file-store.ts` is the only canonical JSON file I/O boundary;
  `src/lib/file-lock.ts` writes only ephemeral lock ownership metadata.
- `src/lib/validate-data.ts` enforces cross-file canonical invariants.
- `src/lib/pipeline/` owns source retrieval, extraction, assessment, collection
  health, and review-proposal creation.
- Binary PDF and DOCX responses retain their original bytes and are converted
  to text before classification or source-ingest analysis. Legacy DOC and RTF
  instruments require a verified manual transcription.
- HTML/XML source fingerprints retain normalized text plus linked-resource
  targets and, for policy documents, the linked response hashes. This prevents
  silent same-URL instrument replacement. Discovery indexes and feeds disable
  linked-document hashing; attachment bytes are fingerprinted only when
  retrieving canonical document or candidate pages.
  Those in-memory attachment responses also participate in extraction: every
  linked instrument must be readable before the landing page is healthy, and
  its extracted text is included in assessment.
  HTML policy fingerprints are scoped to semantic content and relevant
  instrument links so site chrome does not create false changes.
- `src/lib/register-audit.ts` compares official-source fingerprints and marks
  changed or confirmed-missing records stale without automatically
  re-verifying them; temporary retrieval failures remain operational alerts.
- `src/lib/source-url.ts` and `src/lib/pipeline/fetch.ts` enforce the outbound
  source boundary: HTTPS allow-listing, standard-port restrictions, private
  address blocking, DNS-to-socket pinning with failover across every validated
  address, DNS resolution inside the same hard total deadline, a hard
  per-address share of that deadline, explicit
  address-family pinning with Node autoselection disabled, hop-by-hop redirect
  validation, a total request deadline, and a 20 MiB
  response limit.
- Direct-document changes create version-specific source reviews targeting the
  existing policy id. Public reads withhold policies with pending or approved
  update reviews until the review is published or rejected. The withholding
  review is staged immediately after a hash mismatch, before document
  extraction, so a corrupt or image-only replacement cannot leave the previous
  record publicly labelled current. Retry exhaustion remains an explicit
  source-health failure requiring manual review rather than later counting as
  successful coverage. Persisted transition sequence numbers distinguish
  repeated byte versions across intervening revisions, while retries of one
  uninterrupted transition remain idempotent. The sequence is retained on the
  source review and, unlike approval retrieval timestamps, is immutable for
  publication ordering. On every run, the canonical policy's current reviewed
  fingerprint remains authoritative over the collector's cached snapshot, so
  an out-of-band editorial re-verification cannot create a false success or
  false baseline-reversion alert.
- Collector-created reviews retain their stable linked development, allowing
  `scripts/collect.ts` to repair a partial review/development write on the next
  run without losing the detection to URL deduplication. Recovery is
  terminal-state-aware: rejected snapshots are skipped and published snapshots
  are rebuilt from the approved record as promoted developments. Approved and
  published direct-document reviews also reconcile failed retry state and
  advance the reviewed snapshot without allowing an older sequence to regress
  a newer one.
- Public data-service reads also withhold unverified policies, unverified
  timeline events, dismissed developments, and unverified agency narrative.
  Development `relatedPolicyId` values and agency policy associations are
  projected only when their target policy is also public.
  Supersession references are projected only when the successor policy is
  public, preventing a visible record from pointing into withheld canonical
  data.
  Server-rendered pages using those time-dependent projections revalidate
  hourly so verification expiry is reflected without waiting for a deployment.
  Derived framework artifacts must also pass their own verification gate as
  well as the related policy's gate. Their editorial check must be at least as
  recent as the policy's current verification, and source hashes must match
  whenever both are available.
- `src/lib/source-ingest.ts` and `src/mcp/` own the local controlled editorial
  workflow. Publication writes the canonical record while the active review
  still withholds it, then makes the review terminal as the public transaction
  boundary. Linked-development promotion and freshness metadata are recoverable
  side effects; public reads derive their safe state from the terminal review
  even before those writes are repaired. Every
  approval freshly retrieves the official source and requires its
  fingerprint to match the staged evidence; source replacement requires an
  explicitly reviewed replacement draft. Publication retrieves the source
  again and hash-matches it to the approved evidence immediately before the
  canonical workflow proceeds. An exact canonical revision left by a partial
  publication is detected first, kept out of public projections by its active
  review, and reused on retry only after the approval is still current and a
  fresh source retrieval matches the approved fingerprint. A mismatch leaves
  the review active and the partial record withheld for re-approval.
  When automatic extraction fails for a hash-matched document, a structured
  OCR/manual-transcription approval can provide the reviewed text while
  retaining both source-byte and transcription hashes as provenance.
  MCP approval separately requires the human reviewer's identity; the local
  admin token remains an authorization credential, not editorial attribution.
  New policy and timeline approval checks both record ids and official source
  URLs across canonical and active staged content before a review can become
  approved. Editor-supplied JSON passes the same exhaustive canonical
  validators used by CI, including nested date entries, string-only lists,
  required timeline narrative, and strict calendar dates. The only collision
  exemption is a normalized revision match to
  that review's own partial policy or timeline write; re-approval records the
  partial revision hash so publication can update it without permitting
  unrelated overwrites.
  Source identity is centralized in `src/lib/source-url.ts`: extraction,
  collector state, persistence, validation, MCP staging, and publication all
  canonicalize fragments, tracking parameters, query ordering, and trailing
  slashes before storing or comparing a URL. CI rejects non-canonical source
  representations, and `npm run canonicalize:urls` migrates legacy JSON safely.
  Approval also rebases the retained
  development snapshot to that source and evidence, so publication recovery
  cannot reconstruct a stale radar URL. The linked development is rewritten
  from the reviewed record rather than retaining machine-generated factual
  fields. Manually staging a URL already present in the radar retains that
  development snapshot
  so approval or rejection resolves the same public lead. Publication also
  requires the approved verification to remain inside the editorial freshness
  interval; an expired approval must be re-approved before canonical writes.
- Update-review approval stores an editorial revision hash for the target
  policy. Publication uses that hash as an optimistic-concurrency guard and
  refuses to overwrite intervening editorial changes. Full publication updates
  preserve the approved revision timestamp, allowing a retry to recognize its
  own canonical write after a later side effect fails. Audit-only HTTP metadata
  is normalized out of the editorial revision hash while content fingerprints
  and manual OCR/transcription provenance remain part of it.
  Public partial-write withholding uses the same shared policy/timeline
  revision hashes, so later audit-only HTTP metadata cannot expose a record
  before its review reaches the terminal published state.

## Change strategy

Trust-related changes are migrated compatibly where practical. Public API fields
remain stable while richer verification and collection-health fields are added.
Legacy fields are removed only through an explicit versioned migration.
