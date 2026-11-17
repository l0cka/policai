# Citing a record

`/policies/[id]` shows a "Cite this record" block under the related
instruments. It gives two lines, each with a copy button:

1. **Primary source.** A suggested citation to the instrument itself.
2. **This record.** The record's title, its Policai permalink and, when the
   record has a `lastReviewedAt`, the Sydney date it was last verified.

The block is labelled "Suggested citation. Check it against the source." The
citation is built from the record's fields, never from the source document, so
a reader must check it before relying on it. Court requirements have no
citation block.

## Code

- `src/lib/cite.ts` is pure. `citeRecord(policy)` returns `{ citation,
  permalink }` as finished plain text. `CITATION_PATTERNS` maps every
  `PolicyType` to a pattern, so a new policy type fails the typecheck until it
  has one.
- `src/components/related/cite-this-record.tsx` is a server component. Both
  lines are in the server HTML, so the block reads the same without
  JavaScript.
- `src/components/copy-text-button.tsx` is the only client component. It takes
  the finished text as a prop, and the server page imports nothing else from
  it (see the client-boundary rule in `AGENTS.md`).

## Patterns

| Policy type | Pattern | Output |
| --- | --- | --- |
| `legislation`, `regulation` | short title | `Title (Jurisdiction)` when the record's title ends in a four-digit year; otherwise the document pattern |
| every other type | document | `Author, Title (Type, Date) <sourceUrl>` |

- **Short title** follows the AGLC4 shape for Acts, delegated legislation and
  Bills, without a pinpoint. The year comes from the title,
  never from a record date, because the primary date of an Act is often its
  commencement. Jurisdictions print as Cth, NSW, Vic, Qld, WA, SA, Tas, ACT
  and NT.
- **Document** follows the AGLC4 shape for reports and internet materials.
  `Author` is the record's agencies: one name, two joined by "and", three as
  "A, B and C", and more than three as the first name followed by "et al". A
  record with no agency starts at the title. `Type` is the policy type's
  display name. `Date` is the record's primary date.
- **Date precision.** The date goes through `formatPolicyDate`, so a
  day-precision date prints "1 May 2024", a month-precision date "May 2024"
  and a year-precision date "2024". A month or year date never prints a day.

## What is approximate

- **Plain text.** AGLC4 italicises the titles of Acts and documents. The
  copied text carries no italics.
- **Legislation and regulation whose title is a description.** A record such
  as "Electoral (Miscellaneous) Amendment Act 2024 — AI-generated electoral
  advertisements" or "Online safety industry codes covering generative AI and
  AI companions" has no short title in the data, so it gets the document
  pattern, which is not an AGLC4 legislation citation.
- **Legislative instruments.** The short-title pattern assumes the record
  title is the instrument's registered title.
- **Practice notes.** AGLC4 cites a practice note by court, number and title.
  The register does not hold the number as a field, and some `practice_note`
  records are guidelines for litigants, so they get the document pattern with
  the type "Practice Note".
- **Document type.** The register's type name ("Guideline", "Framework",
  "Tool", "Funding Program") stands in for the document type that AGLC4 takes
  from the document itself.
- **Date.** The primary date can be a commencement, amendment or issue date,
  not the publication date AGLC4 expects.
- **Author.** Agencies are the bodies the register links to the record. They
  are usually, but not always, the publishing body.

## Tests

`src/lib/cite.test.ts` asserts the exact string for every `PolicyType` at every
date precision, each jurisdiction abbreviation, the author forms and the
permalink line with and without a verification date.
`src/components/related/cite-this-record.test.tsx` asserts the server HTML and
what each button copies.
