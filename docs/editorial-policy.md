# Editorial policy

This is the style guide for Policai's written pieces, each a
`data/articles/<slug>.md` file served at `/analysis`. It covers voice, the
three formats, citations, the line between fact and analysis, the standard notices,
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
Lengths count body words only. They exclude frontmatter, the standard
notices, captions and any figure or table that replaces prose. A piece
outside its range needs a reason in the pull request. Shorter is better:
the limits are ceilings, not targets.

### Weekly briefing (`weekly_briefing`)

What verified activity there was in Australian AI policy in the past week, and
what falls due next.

- **Source:** the `/this-week` window for the same dates. Name the window in
  the first paragraph ("the seven days to 14 October 2026"). If `/this-week`
  warns that the window is stale or coverage is unavailable, say so. Never
  describe an empty window as a quiet week.
- **Length:** 250 to 450 words.
- **Structure:**
  1. A two- or three-sentence lead that states, as fact, the verified change
     the briefing opens with. Why it matters goes in `## Why it matters`.
  2. `## What changed`: each verified development or register change, one
     or two sentences each, with its citation.
  3. `## Coming up`: deadlines and commencements from the `/this-week`
     "Coming up" list, with their recorded precision. Use a short table when
     there are three or more dates.
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
- **Length:** 300 to 550 words.
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

- **Length:** 700 to 1,300 words.
- **Structure:** a lead that states the question the piece answers, then `##`
  sections that each answer one sub-question. Use a comparison table or
  matrix where the reader compares jurisdictions or instruments. End with
  `## Where to follow this`, which links to the relevant register views.
- **Upkeep:** an explainer is revised when a record it cites changes. Each
  revision updates `updatedAt`. A revision that changes a factual claim also
  adds a correction or update note (see
  [Corrections, updates and withdrawals](#corrections-updates-and-withdrawals)).

## Tightness

Readers act on these pieces, so they should reach the point at once.

- Open with the point in one or two sentences. Do not warm up to it.
- Do not restate the summary or the title in the body.
- One idea per paragraph. Cut a paragraph that repeats another.
- Cut hedges and throat-clearing ("it is worth noting", "in order to").
- Prefer a list or table where the reader compares items, and a figure
  where a paragraph would walk through a sequence.
- Keep a sentence only if it states a sourced fact, marked analysis, or a
  date the reader needs.

## Figures

A figure is a diagram, table or chart that carries content the text would
otherwise spend a paragraph on. Use one when it helps the reader understand:

- **Sequence:** a timeline of an instrument's stages or key dates.
- **Comparison:** a table or matrix across jurisdictions or instruments.
- **Process:** a flow of who must do what, in what order.
- **Distribution:** a chart of counts by jurisdiction, type or status, drawn
  from register data.

Do not add a figure as decoration, or one that repeats the sentence above
it. A piece needs no figure when the text is already short and clear. A
figure replaces the paragraph or list it summarises. The text around it
states the conclusion in one sentence, and a section that is only a figure
keeps its heading.

### Writing a figure

A figure is a fenced `figure` block in the piece's Markdown. It has a `kind`
(`timeline`, `matrix`, `flow` or `chart`), a `title`, `alt` text and a
`caption`. The authoring format and its limits are in the Articles section of
the repository's `AGENTS.md`.

- **Title:** at most 100 characters, and it states the point.
- **Alt text:** one plain sentence of at least 20 characters that states the
  point, not only the type ("Timeline showing consultation closing before
  commencement" rather than "A timeline"). For a comparison or chart, it
  names the standout values. It does not repeat the caption.
- **Caption:** says what the reader is looking at and the date of the data.
  A register chart's caption leaves its date to the chart, which states it.
- **Limits:** a timeline has 2 to 7 entries and an `asAt` date. A comparison
  has 2 to 9 rows and 2 to 5 columns, with `~` for "Not stated". A process
  has 3 to 6 steps and at most one branch, taken from a decision step. A
  chart has 3 to 10 bars.

### Citing a figure

A figure follows the same citation rule as text, except for a register chart
(below). Each claim in it cites a public, currently verified register record
or an official source. Every record a timeline, comparison or process figure
cites, and every source it uses, must also be listed in the piece's `cites`
and `sources`. A figure never adds a number or date its sources do not
state, and a figure's analysis is marked as analysis like any other.

The platform checks a figure like the text. Validation rejects a figure with
no title, alt text or caption, an unknown kind, a count outside the limits
above, a date that does not exist (such as 2026-02-30), a repeated matrix
column or row header, a repeated timeline date and title, a fence that is
not at the start of a line (inside a list or quote, or indented), and a cited
record or source missing from the piece's lists. A figure
citation is also covered by the added-citation rule and the "Source under
review" banner.

### Register charts

A chart counts the public register when the page renders, so withheld,
unverified and trashed records are never counted, and its numbers change as
the register does. It cites the register as a whole ("Policai register, N
public records, as at <date>"), not a list of records. It makes no claim
about any one record's content, so a record that is past its review date is
counted without raising an error or the banner.

The prose must not restate the chart's numbers, so the text cannot go stale
as the counts change. Say what the chart shows ("most records are federal")
and leave the figures to the chart. The Writer and the Editorial Manager check
this.

The as-at date is the date of the last register change: the Sydney calendar
day of the most recent `updatedAt` across every register record, including
withheld and trashed ones, because withholding, trashing or publishing a
record changes the public count. It is not the collection, build or render
date. A record without `updatedAt` fails validation. Do not write a date in
the prose that depends on it, because the chart states it.

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
  `npm run validate:data` rejects a body link missing from the frontmatter,
  a source off the official allow-list, and a new citation to a record that
  is withheld, trashed, unverified or marked "Review due". If a record the
  published piece already cites later becomes withheld, unverified or
  "Review due", validation reports a warning and the page shows the "Source
  under review" banner. A citation to a trashed or unknown record is always
  an error.
  Links to `/developments` and to Policai views such as `/this-week`,
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
- with a link to that entry, `/developments#<development id>`; and
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

## Images

Pieces carry one high-quality lead image. A piece with no image that meets
these rules publishes without one.

### Licences

- **Allowed:** CC0, the Public Domain Mark, CC BY and CC BY-SA, any version.
- **Not allowed:** any licence with NonCommercial (NC) or NoDerivatives (ND)
  terms. Policai's commercial status is not settled, and ND forbids the crop a
  lead image needs.
- **Not allowed:** Unsplash and Pexels images, whose own licences are not
  Creative Commons, and any image whose licence is unclear.
- Prefer Wikimedia Commons, Openverse, and government sites that publish under
  CC BY 4.0.
- A site-wide CC BY notice is not enough. Confirm that the licence covers
  the image itself; government notices commonly exclude photographs, logos,
  the Coat of Arms and third-party material. If the image's own licence is
  not stated, treat it as unclear.
- Check the licence on the file's own page, not on a search result or an
  aggregator. Record the date of that check as `licenceCheckedAt`. Check it
  again whenever the image is changed.

### Quality

- The source file is at least 2048 px on its long edge.
- The repository keeps one master per image.
  `npm run add:article-image -- <url> <slug>` downloads the source, refuses
  one under 2048 px on its long edge, and re-encodes it to 2048 px as
  `public/images/articles/<slug>/lead.jpg`. The site serves smaller sizes
  from that master.
- `npm run validate:data` rejects an image file whose long edge is outside
  2048 to 2560 px, that is larger than 1.2 MB, or that does not match its
  declared size, and any file under `public/images/articles/` that no piece
  uses.

### Attribution

Each image records its title, creator and creator URL, source page URL,
licence and licence URL, any modifications (for example "cropped") and
`licenceCheckedAt`. Copy these from the source page. Never guess a licence
field.

A modified CC BY-SA image is shared under the same CC BY-SA licence, and its
attribution says so.

The platform renders a TASL attribution under the image: the title linked
to the source page, the creator (linked when there is a creator URL), the
licence linked to its deed, and any modifications. Validation rejects a
licence that is not on the allowed list, a licence URL that does not match
the licence, and a source or creator URL on Unsplash or Pexels.

### Editorial limits

- An image illustrates the subject. It never implies that a person, agency or
  organisation endorses the piece or Policai. Do not use logos, crests or
  official seals as lead images.
- No identifiable private individuals. Public officials may appear only in
  official images of the public role that the piece discusses.
- No AI-generated or AI-altered images. Cropping and resizing are the only
  permitted changes.
- Alt text describes what the image shows, in one plain sentence. It does not
  repeat the title or caption, and it does not interpret the image.

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
  record and the piece. The banner clears once the re-verified record is live on
  the site, within an hour of that deploy;
  if the piece's claims no longer hold, publish a correction or update.
- **Withdrawal:** for a piece that cannot be corrected, for example because
  its subject was misidentified or its central claim was wrong. Set `status`
  to `withdrawn` with `withdrawnAt` and `withdrawnReason`. The URL stays as a
  tombstone that says when and why the piece was withdrawn. Never delete a
  published piece; validation rejects the deletion.
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

1. The Policai Writer drafts the piece and runs `npm run check`, which
   includes the article checks in `npm run validate:data`.
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
