# Relevance Gate — Design

Date: 2026-08-07
Status: Approved by Daniel (in-session; toggle variant chosen)

## Purpose

The pipeline classifies everything it ingests — it has no way to say "this is
not radar material," so practitioner profile series (12 of Law Council's 28
items are "Meet [name] independent childrens lawyer") land in the feed. Add a
relevance judgement to enrichment, exclude irrelevant items from the feed and
digest, and keep them auditable behind a feed toggle so agent misjudgements
stay visible.

## Changes

**Data model** — `items.relevant BOOLEAN NOT NULL DEFAULT true`. Added to
`db/schema.sql` for fresh installs and via
`db/migrations/2026-08-07-relevance.sql` for the live database. The migration
also marks the existing ICL profile items irrelevant
(`url ~ 'meet-.*-independent-childrens-lawyer'`).

**Enrichment contract** — `EnrichmentSchema` gains a required
`relevant: boolean`. Required, not defaulted: the agent must judge every item.
`save-enrichment` persists it. When `relevant` is false the agent sets
`opportunity: false` and the blurb is one line saying what the item is and why
it is out of scope (that line is what the audit toggle shows).

**Runbook bar** — an item is irrelevant when it has no bearing on the
Australian pro bono / access-to-justice / legal-assistance sector's work:
individual practitioner profiles, awards and HR announcements, event recaps,
pure marketing. Sector-adjacent news (legal tech, law reform, funding) stays
relevant.

**Dashboard feed** — default query adds `i.relevant`; a "Filtered" toggle
(styled like the Opportunities pill, param `filtered=1`) shows ONLY the
screened-out items so the agent's judgement can be audited. The deadlines
timeline also excludes irrelevant items' deadlines.

**Digest** — item selection adds `AND relevant` (opportunities, streams, and
deadlines sections alike).

## Edge cases

- Already-enriched items keep `relevant = true` (default) unless the migration
  marks them.
- Old-format agent payloads without `relevant` fail validation (exit 2) — the
  runbook and CLI deploy together, so this only bites if they drift.
- `filtered=1` with zero screened items shows the feed's empty state.

## Testing / verification

- `save-enrichment` integration tests: payloads gain `relevant`; new case
  asserting a `relevant: false` payload persists it.
- `render-digest` unit tests unchanged (rendering is unchanged — exclusion is
  in the query).
- Full suite on Argus (throwaway Postgres); build + visual check via
  `ops/deploy.sh`; nothing heavy on the MacBook.
