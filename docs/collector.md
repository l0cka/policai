# Collector Operations

The collector is the automation behind the Developments feed: it watches official Australian government pages and feeds for new AI-policy activity and records what it finds in the repo's data files. It replaced the old Vercel-cron scraper/pipeline in July 2026.

## What one collection pass does

1. Loads the seen-URL registry (`data/watch-state.json`) and the existing feed (`data/developments.json`).
2. For each due source marked `automation: automatic` in [`src/lib/pipeline/sources.ts`](../src/lib/pipeline/sources.ts) (daily sources every run, weekly sources every 6+ days):
   - fetches the index page or RSS feed,
  - rejects bot-challenge pages even when they return HTTP 200 or are
    mislabelled as generic binary content,
   - extracts readable text from HTML and text-bearing PDFs before assessment,
   - counts all extractable items separately from AI-policy candidates,
   - extracts AI-relevant link candidates ([`extract.ts`](../src/lib/pipeline/extract.ts)),
   - selects both new candidates and retryable pending candidates so repeated
     failures cannot monopolise a source's per-run limit,
   - fetches each new page and classifies it ([`classify.ts`](../src/lib/pipeline/classify.ts)).
3. Writes results:
   - detections (score ≥ 0.5) → `data/developments.json`,
   - AI detections (score ≥ 0.7) and all heuristic detections that enter the
     feed → also staged in `data/source-reviews.json`,
   - candidate retry state and direct-document fingerprints →
     `data/watch-state.json`,
   - coverage health, per-source item/candidate counts, and errors →
     `public/data/meta.json`.
4. The collector **never writes `data/policies.json`** — the register only changes through reviewed commits, and the GitHub workflow fails if a collector run touches it.

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
An unreadable changed version that later returns to the verified baseline also
creates a new sequenced `baseline_reversion` review. This prevents the obsolete
changed-version review from withholding a valid baseline forever while still
requiring an editor to confirm the live bytes before public access is restored.

HTML fingerprints include every publication-date metadata field used by
extraction, relevant instrument links, and visible text. Linked PDF, Word, and RTF documents are retrieved and
their byte hashes are folded into the landing page's fingerprint. A landing
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
does not propose a duplicate policy. Pending and approved update reviews
temporarily withhold that policy from public reads until an editor publishes
the re-verified record or rejects the change review. Publishing refuses an
older update when a newer non-rejected source version exists, and publishing
the newest version rejects older still-active update reviews as superseded.

## Classification modes

| Mode | Trigger | Behaviour |
|---|---|---|
| AI | `ANTHROPIC_API_KEY` (preferred) or `OPENROUTER_API_KEY` set | Page content analysed by the model in `src/lib/ai-client.ts` (override with `AI_MODEL`); detections carry the model's relevance score |
| Heuristic | no key | Keyword scoring only; confidence capped at 0.65 so items always display as "Needs review" |

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
- **manual sources** — official endpoints protected by WAF/browser challenges
  or otherwise unsuitable for dependable cloud retrieval.

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

## Production automation

[`.github/workflows/collect.yml`](../.github/workflows/collect.yml) runs daily at 19:30 UTC (~05:30 Sydney):

1. `npm run collect`
2. `npm run validate:data`
3. Guard: fail if `data/policies.json` changed
4. Commit `developments.json`, `meta.json`, `watch-state.json`,
   `source-reviews.json` and push, including failed-health and retry state
5. If collection reported failed coverage, fail the job only after that
   operational state is preserved
6. On any failure: open (or comment on) an issue labelled `collector-failure`
   so scheduled breakage is never silent

The push triggers a Vercel deployment, so the site republishes with the new data. Manual runs: Actions → "Collect AI policy developments" → Run workflow (optionally with a single source id).

The CLI persists source reviews and developments before advancing
`watch-state.json`. Stable review/development ids make a retry idempotent if an
earlier write or the process fails part-way through, so a detected source
version cannot be lost merely because its state write completed first.

**Repository configuration:**

- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` secret (optional, enables AI classification)
- `AI_MODEL` repository variable (optional model override)
- `COLLECTOR_DEPLOY_KEY` secret — private half of the repo's write deploy key ("collector (collect.yml push)"). Checkout uses it (`ssh-key:`) so the push authenticates as the deploy key, and the "Protect main" ruleset lists **Deploy keys** as a bypass actor (`bypass_mode: always`). Without this pair the push is rejected with `GH013: Repository rule violations` — the default `GITHUB_TOKEN` cannot be a bypass actor on a user-owned repo. The safety story does not depend on the ruleset here: the registry-guard step and CI both enforce that automation never touches `policies.json`.

Without secrets the workflow still runs in heuristic mode.

## Reviewing detections into the register

Detections staged in `data/source-reviews.json` are proposals. To publish one:

1. Run the local MCP server (`npm run mcp`).
2. Inspect the staged source and correct the draft, especially its labelled
   primary date.
3. Call `approve_staged_source` with reviewer identity and notes.
   The MCP input requires a human `reviewer`; the admin token authorises the
   operation but is not recorded as the person who performed the review.
   If the tracked policy or timeline event changed after staging, stage it
   again to refresh the review, rebase the edited `proposedRecord` on that
   current record, and pass the refreshed policy base or timeline revision as
   `expectedTargetRevisionHash`. Approval rejects stale drafts that do not
   acknowledge the current canonical revision.
4. Call the publish tool. Publishing refuses pending drafts and creates the
   verified policy or timeline record through `src/lib/source-ingest.ts`.
5. Run `npm run validate:data`, commit, and push (or open a PR).

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
hardened retriever or the configured analysis provider is unavailable, use the MCP
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
is dead, an explicit replacement additionally sets `replaceTargetSource` and
supplies a proposed record that preserves the target id while using the new
official URL. Revision hashes and collision checks bind that migration to the
current canonical record.

A browser-captured review remains subject to the normal gates.
`approve_staged_source` requires a fresh matching `browserCapture`, and its
`reviewer` must match the capture reviewer. `publish_staged_source` requires
another fresh matching capture. Any page-text, relevant-link, or document-byte
change forces re-staging or re-approval rather than silently refreshing the
trusted baseline.

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
change is immaterial, approve and publish the unchanged/corrected policy draft
with reviewer notes; this refreshes the evidence hash and review metadata.
If the exact changed version is image-only or otherwise not machine-readable,
`approve_staged_source` accepts a controlled `manualExtraction` only after
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
feeds for discovery and primary instrument pages for verification. Verify with:

```bash
npm run audit:sources -- --source=<id>
npm run collect -- --dry-run --source=<id>
```

## Troubleshooting

- **The workflow fails at `git push` with `GH013: Repository rule violations`** — the deploy-key bypass is broken: either the `COLLECTOR_DEPLOY_KEY` secret / write deploy key was removed, or "Deploy keys" is missing from the "Protect main" ruleset bypass list (Settings → Rules → Rulesets → Protect main → Bypass list, or `gh api -X PUT repos/l0cka/policai/rulesets/<id>` with `{"actor_type": "DeployKey", "bypass_mode": "always"}` in `bypass_actors`).
- **A source keeps failing** — check `meta.json` → `collector.sourceResults`.
  If the endpoint consistently requires a browser, keep it enabled but change
  it to `automation: manual` with an explanation. Do not count a challenge page
  as coverage and do not disable an authoritative source merely because it
  cannot be automated.
- **An HTML source reports no coverage** — only links inside recognised
  publication/result containers count as index entries. Navigation, footer,
  homepage, login, and soft-error links do not make a source healthy; inspect
  the source markup and add a durable extraction rule if its real entries are
  not recognised.
- **Nothing new detected** — expected on most days; the feed only grows when monitored pages change. Check `watch-state.json` to confirm URLs are being seen.
- **A candidate cannot be retrieved** — retryable failures remain pending for
  at most five attempts. HTTP 404, bot challenges, unsafe redirect targets, and
  exhausted retries become terminal `failed` watch-state entries so they do not
  consume collection capacity forever.
- **A feed links away from an official host** — the candidate is ignored before
  it enters watch state. Redirects are checked hop-by-hop, and production DNS
  resolution must return only public network addresses. The validated address
  is pinned to the TLS connection and checked after connection; each validated
  address is tried within the shared deadline. Each retrieval has one deadline
  across redirects and a 20 MiB response limit. The live source audit applies
  the same non-root-to-homepage redirect rejection as scheduled collection.
- **A verified source changed** — run
  `npm run audit:register -- --write-evidence`; the record is marked `stale`
  and withheld publicly until reviewed. Re-running the audit never restores
  verification automatically.
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
- **A record has not been reviewed for 90 days** — public reads treat its
  verification as stale until an editor re-verifies and republishes it.
- **A manual review timestamp is in the future** — validation fails outside the
  five-minute clock-skew allowance, and coverage never counts it as current.
- **Validation fails in CI** — run `npm run validate:data` locally; it prints every structural error with the offending record id.

Stage-only non-government leads remain pending until an editor supplies
`officialSourceUrl` and an explicitly reviewed replacement `proposedRecord` to
`approve_staged_source`. Approval retrieves and extracts that official source
again, replaces the discovery evidence, and only then validates the replacement
record. Publishing synchronizes the linked development from the reviewed record
and marks its assessment as editorial.

If an editor manually stages an official URL that already exists as a detected
radar item, the review retains that development id and snapshot. Publishing
promotes it and rejection dismisses it, including after partial-write recovery.
