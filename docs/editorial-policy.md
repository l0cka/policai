# Editorial policy

This is the style guide for Policai's written pieces: the files in
`data/articles/` served at `/analysis`. It covers voice, the three formats,
citations, the line between fact and analysis, the standard notices,
corrections and withdrawals, and what Policai does not publish.

Pieces are the Policai analysis tier in [the trust model](./trust-model.md),
kept visibly apart from verified register records and from
unverified developments. The register and the developments feed stay neutral
tracking. A piece never changes either of them.

Daniel Alkurdi is the editor. He approves this policy and the first three
pieces. After that, a piece publishes on the Editorial Manager's
`EDITORIAL APPROVE <sha>` comment on its pull request.

## Voice

Write for a professional who must act on Australian AI policy: a lawyer, a
policy officer, a compliance lead, a procurement manager or a researcher.

- Use plain Australian English and Australian spelling (`organisation`,
  `licence` as a noun, `program`).
- Be precise. Name the instrument, the issuer, the jurisdiction and the date.
  Write "the Policy for the responsible use of AI in government (version 2.0)",
  not "the new rules".
- Use short sentences, one idea each, in the active voice.
- No hype. Do not write "landmark", "game-changing", "sweeping" or "crackdown".
  Describe what an instrument does and let the reader judge its size.
- Do not predict. Write about what an instrument says and what follows from it.
  When a consequence depends on something not yet known, name that condition.
- Define each acronym at first use, then use it consistently.
- Refer to people by role and name at first mention, then by role.
- Use the register's own terms for status (`active`, `superseded`, `closed`)
  and date precision. If the register records a date as month-only, write the
  month, never an invented day.
- Write dates as `16 October 2026`, or `October 2026` when only the month is
  known.

## Formats

Each piece sets `type` in its frontmatter to one of the three formats below.
Lengths count body words only, without frontmatter or the standard notices.
A piece outside its range needs a reason in the pull request.

### Weekly briefing (`weekly_briefing`)

What verified activity there was in Australian AI policy in the past week, and
what falls due next.

- **Source:** the `/this-week` window for the same dates. Name the window in
  the first paragraph ("the seven days to 14 October 2026"). If `/this-week`
  warns that the window is stale or coverage is unavailable, say so. Never
  describe an empty window as a quiet week.
- **Length:** 400 to 800 words.
- **Structure:**
  1. A two- or three-sentence lead that states, as fact, the verified change
     the briefing opens with. Why it matters goes in `## Why it matters`.
  2. `## What changed`: each verified development or register change, one
     short paragraph each, with its citation.
  3. `## Coming up`: deadlines and commencements from the `/this-week`
     "Coming up" list, with their recorded precision.
  4. `## Why it matters`: analysis, marked as such (see
     [Fact and analysis](#fact-and-analysis)).
  5. Optional `## Detected, not yet verified`: automated leads, worded as
     [Unverified developments](#unverified-developments) requires.
- **Title:** `Policai weekly: <date range>`, for example
  `Policai weekly: 8–14 October 2026`.

### Instrument note (`instrument_note`)

A short analysis of one significant register record when it is first published
or materially changes.

- **Trigger:** a new verified register record, or a published source review
  that changes a record's status, dates or substance. A refreshed fingerprint
  with no change in substance does not justify a note.
- **Length:** 500 to 900 words.
- **Structure:**
  1. A lead: what the instrument is, who issued it, and what happened.
  2. `## What it says`: the instrument's scope, obligations and dates, each
     tied to the record or the official source.
  3. `## What changed`: for an update, the difference from the previous
     version. Omit this section for a first publication.
  4. `## Who it affects`: the entities in scope, as the instrument defines
     them.
  5. `## Analysis`: consequences and open questions, marked as analysis.
- **Citations:** the note cites its subject record in `cites`, and that
  record's official source URL in `sources`.

### Explainer (`explainer`)

An evergreen guide to a topic, such as how a type of instrument works or how
the jurisdictions compare.

- **Length:** 1,200 to 2,500 words.
- **Structure:** a lead that states the question the piece answers, then `##`
  sections that each answer one sub-question. End with `## Where to follow
  this`, which links to the relevant register views.
- **Upkeep:** an explainer is revised when a record it cites changes. Each
  revision updates `updatedAt`. A revision that changes a factual claim also
  adds a correction or update note (see
  [Corrections, updates and withdrawals](#corrections-updates-and-withdrawals)).

## Citations

Every factual claim cites a source a reader can open. A factual claim is any
statement about what an instrument says, who issued it, its status, a date,
a number, or an event.

- **Allowed sources:** a public, verified register record, by its id in
  `cites` and as a link to `/policies/<id>` in the text; or an official
  source on a `.gov.au` or allow-listed host, by its URL in `sources` and as
  a link in the text.
- **Not allowed as support:** news reports, commentary, social media, vendor
  material, other trackers, a withheld, stale, trashed or unverified register
  record, or a development that is not verified. These can prompt a
  piece. They cannot support a claim in it.
- **Re-read before citing.** Open each source while drafting and confirm that
  it says what the piece says. A register record's summary is not a
  substitute for its official source when the piece quotes or paraphrases the
  instrument's words.
- **Cite at the claim.** Put the link in the sentence that makes the claim,
  not in a list at the end.
- **Quote sparingly and exactly.** Quote an instrument when its exact words
  matter, in quotation marks, with a link to the page or section that holds
  them.
- **Every link in the body appears in the frontmatter.** Each `/policies/<id>`
  link appears in `cites`. Each external official link appears in `sources`.
  Validation rejects a citation to a record that is not public and verified.
  Links to `/developments` entries and to Policai views such as `/this-week`,
  `/courts` or `/timeline` support no claim and need no frontmatter entry.
  Every other link does.

If a claim cannot be cited, remove it.

## Fact and analysis

Readers must always see which sentences report a source and which are
Policai's view.

- **Fact** reports what a cited source states, in neutral words, with the
  citation in the same sentence.
- **Analysis** is Policai's reading: consequences, comparisons, open
  questions, what a reader may want to check. Put it in a section headed
  `## Analysis` or `## Why it matters`, or start the sentence with an explicit
  marker ("In Policai's analysis, …", "Policai's reading is that …").
- Analysis argues about consequences for the people an instrument affects. It
  does not argue for or against a party, a minister or a government.
- Analysis can say that an instrument is unclear, inconsistent with another
  instrument, or silent on a point. It shows the passages that support that
  reading.
- Do not attribute a motive or intention to an issuer unless the official
  source states it. Quote the stated purpose instead.

### Unverified developments

An automated development that is not verified may appear only:

- with the words "detected, not yet verified";
- with a link to its entry on `/developments`; and
- never as support for a factual claim, and never in a lead or title.

## Standard notices

The platform renders the byline "Policai", the "Analysis" tier label, the
disclosure and the notice on every published piece. Do not change their
wording in a piece. Changing it means changing this policy.

**AI disclosure:**

> This piece was researched and drafted with AI, checked against the official
> sources it cites, and published by Daniel Alkurdi as editor.

**Not legal advice:**

> This is general information and analysis, not legal advice. Check the
> official sources and get advice on your own circumstances before you act.

## Corrections, updates and withdrawals

Policai corrects in the open. A published piece never changes silently.

- **Correction:** a factual error. Fix the text and add an entry to
  `corrections` with the date and a sentence that says what was wrong and
  what it now says. Update `updatedAt`.
- **Update:** a cited source changed after publication and the piece was
  correct when published. Revise the text and add a dated `corrections` entry
  that starts with "Update:" and names the source change.
- **Source under review:** when a cited record becomes stale or withheld, the
  platform shows a "Source under review" banner. The editor re-reads the
  record and the piece. The banner clears when the record is verified again;
  if the piece's claims no longer hold, publish a correction or update.
- **Withdrawal:** for a piece that cannot be corrected, for example because
  its subject was misidentified or its central claim was wrong. Set `status`
  to `withdrawn` with a reason. The URL stays as a tombstone that says when
  and why the piece was withdrawn. Never delete a published piece.
- Every correction, update and withdrawal goes through a pull request and the
  same editorial approval as a new piece.
- Typo fixes that change no meaning need no correction entry.

Readers report errors through the site's Feedback link
(<https://github.com/l0cka/policai/issues>). Each report is checked against
the official source before the piece is corrected or the report is closed.

## What Policai does not publish

- Legal advice, or advice about what a particular reader should do.
- Party-political advocacy: support for or opposition to a party, candidate,
  minister or government, or voting recommendations.
- Claims that cannot be cited to a public verified record or an official
  source, including rumours, leaks and unverified reports.
- An unverified development presented as fact.
- Predictions of what a government, regulator or court will decide.
- Commentary on named private individuals, or on named organisations beyond
  what an official source states about them.
- Sponsored content, advertising or paid placement.
- Text copied from a source beyond short, attributed quotations.

## Review route

A piece is a pull request that adds or changes one `data/articles/<slug>.md`
file. The slug is lowercase kebab case and stays the same after publication.

1. The Policai Writer drafts the piece and runs `npm run validate:data` and
   `npm run check`.
2. The Editorial Manager checks every claim against its source, the fact and
   analysis boundary, and this policy, then records `EDITORIAL APPROVE <sha>`
   or `EDITORIAL REJECT <sha>`.
3. Until Daniel has approved this policy and the first three pieces, the PM
   also records `DANIEL APPROVE <sha>` from Daniel's own words.
4. QA checks the rendered page and the citations at the same head, then the
   piece merges and deploys.

A new push voids every approval recorded for the earlier head.

## Revisiting this policy

Revisit the formats after about eight weekly briefings if readership is low,
and revisit the review route if corrections suggest that review is too thin.
Changes to this policy need Daniel's approval.
