# First-contact referral

A lookup that answers one question: which Australian legal service should
this person contact first? It returns service name, contact, what to bring,
the source page and the date it was last checked. It gives no legal advice,
no eligibility decision and no view on the person's case.

## Why

The vals.ai A2J benchmark (10 Nov 2026, US only) found models meet 78 to 87%
of criteria when explaining the law but 30 to 50% when naming the specific
local service, and they default to national directories. This tool supplies
the local answer from a curated, dated dataset.

## Data

`dashboard/lib/first-contact-services.json`, parsed and validated by
`dashboard/lib/first-contact.ts`. It is separate from `sector.json`, which
describes the sector, not intake. A service may name the sector organisation
it belongs to (`organisation`, matching `Org.name`).

| Field | Meaning |
| --- | --- |
| `id`, `name` | stable kebab-case id and public name |
| `kind` | `legal_aid_commission`, `legal_aid_helpline`, `clc`, `fvpls`, `atsils`, `national` |
| `level` | `local`, `state` or `national`; drives ranking |
| `states` | one or more of NSW, VIC, QLD, WA, SA, TAS, ACT, NT |
| `catchment` | `statewide: true`, or `postcodes` (exact `"3000"` or range `"3000-3006"`), or `lgas` |
| `problems` | problem types handled (list below); `general` means any |
| `intake` | `phone`, `url`, `hours` (all optional) |
| `eligibility` | the service's own words, short, optional |
| `languages`, `cultural` | languages offered; cultural focus (`aboriginal_torres_strait_islander`, `under_18`, `family_violence`) |
| `bring` | what to bring, from the service's page |
| `provenance` | per populated field: `{ url, checked }` (`checked` is `YYYY-MM-DD`) |
| `review` | `unreviewed` or `reviewed` |

Problem types: `family_violence`, `family_law`, `child_protection`,
`criminal`, `fines`, `tenancy`, `debt`, `employment`, `discrimination`,
`immigration`, `social_security`, `wills_and_estates`, `consumer`, `general`.

Rules the validator enforces: every populated field of a service except
`id`, `name`, `kind`, `level`, `states` and `review` has a provenance entry
with an https URL and a real calendar date not in the future; postcodes are
four digits and ranges run low to high; a `local` service has a catchment
other than `statewide`; ids are unique. A field the source does not state is
left out, never guessed. Phone numbers are copied from the organisation's own
page and never composed.

## Review gate

Same pattern as `rule-scope.json` in the root app: only `reviewed` records are
served. Pilot records are `unreviewed`, so production returns no services until
a person checks each against its source and flips `review`. Tests and the
`includeUnreviewed` option of the pure function use fixtures.

## Pilot records

Seven records, all `unreviewed`, all dated 2026-11-11, each field taken from
the organisation's own public page (the per-field `provenance` URL):

- NSW: LawAccess NSW (general line, staff are not lawyers), Legal Aid NSW
  Domestic Violence Unit, Youth Hotline, Aboriginal Legal Service NSW/ACT.
- VIC: Victoria Legal Aid Legal Help, Djirra (FVPLS), Victorian Aboriginal
  Legal Service.

A reviewer must check these before flipping `review`:

- Djirra: the number is 1800 354 772 (1800DJIRRA), checked 2026-11-11. The
  home page and every page footer show and link it as `tel:1800354772`, which
  is the `intake.phone` source. The contact page
  (`https://djirra.org.au/contact-us/`, the canonical URL; `/contact/` serves
  the same content) shows the same number as text but its `tel:` link wrongly
  targets 1800105303, so never copy a number from that link. Offices are open
  9am to 5pm Monday to Friday. `sector-locations.json` cites `/contact/`.
- ALS NSW/ACT is listed for NSW only; its ACT catchment is not recorded.
- Community legal centres are not in the pilot. Each CLC needs its own
  catchment from its own page, and none is composed from a directory.

## Loading

`dashboard/lib/first-contact-data.ts` exposes `SERVICES` (the JSON, cast to
the service type) and `lookup`, which the route, the MCP handler and the tool
all call. The first lookup validates the JSON against that day's Sydney date and throws
on any error, so invalid data never serves. It does not run at module load,
where a Workers isolate may report the Unix epoch as the date. A test also
validates the shipped JSON.

## Query contract

`find_first_contact({ state, postcode?, lga?, problem, circumstances? })`

- `state`: required, a state or territory code.
- `postcode`: four digits, optional.
- `lga`: optional local government area name.
- `problem`: one problem type; unknown values are rejected.
- `circumstances`: optional `{ aboriginal_torres_strait_islander?, under_18?, family_violence?, language? }`.

Result: `{ status, services[], notice }`. `status` is `ok`; `no_match` when the state has
reviewed records but none fit the query; or `none_reviewed` when the state has
no reviewed record. Each service carries `rank`, `tier`,
`name`, `kind`, `phone`, `url`, `hours`, `eligibility`, `bring`, `languages`,
`why` (a fixed phrase naming the matching rule), `source`, `sources` (the
provenance `{ url, checked }` of each field shown, keyed by field) and `checked`
(the oldest provenance date on the fields shown). `notice` is a fixed
sentence: this is a referral, not legal advice; check eligibility with the
service.

## Ranking

Eligible means the service's state matches, its `problems` include the query
problem or `general`, and, for every non-national service (state, local and
specialist), its catchment contains the postcode or LGA (a statewide service
always matches; a postcode catchment never matches without a postcode). Then, in order:

1. Specific: a `cultural` service whose focus matches a stated circumstance
   (ATSILS, FVPLS), and any `local` service whose catchment matches.
2. State: the legal aid commission and its helpline.
3. National fallbacks.

`aboriginal_torres_strait_islander` and `under_18` are gates: a service with
either is offered only when every gate it carries is stated, so a family
violence query alone never reaches an Aboriginal-only service and adults are
not shown an under-18 line. An FVPLS also needs family violence stated, as the circumstance or as the problem. `family_violence` is otherwise a boost, not a gate. The gates apply to national
services too. `circumstances.language` is accepted but not used for ranking.

Inside a tier: a service whose problems list the exact problem before
`general`; then fewer catchment postcodes first (narrower is more specific);
then name (statewide services tie). The output is capped at five. Without a postcode or LGA, only statewide services are eligible (specialist
statewide services still rank as specific); local and regional ones are not.

## Where it lives

- Pure logic and validation: `dashboard/lib/first-contact.ts`.
- JSON: `GET /api/first-contact?state=&postcode=&problem=&...` (read-only,
  400 on a bad query).
- MCP: `POST /mcp`, a stateless JSON-RPC 2.0 handler (protocol 2025-06-18:
  `initialize`, `ping`, `tools/list`, `tools/call`; batches are refused with
  -32600; bodies over 16 KiB, by `Content-Length` and by a streamed byte count that stops reading at the limit, are refused;
  there is no Origin check because the endpoint is public, stateless and sets no
  cookies) exposing `find_first_contact`. The dashboard has
  no MCP SDK and the tool is one function, so the handler is hand-written
  rather than adding a dependency.
- WebMCP: `app/first-contact-webmcp.tsx` registers the same tool through
  `document.modelContext.registerTool`, following
  `src/components/webmcp-tools.tsx` in the root app, and calls the JSON route.
- Tool definition (name, description, input schema, annotations) lives once,
  in `first-contact.ts`, and all three surfaces read it.

## Not covered

Eligibility, means or merits tests; opening hours verification beyond the
checked page; services outside NSW and VIC in the pilot; LGA lookup from
postcode. What would change this: a postcode-to-LGA table, national services
with reviewed records, or a reviewer workflow on a decision card.

Known limits: a postcode is not checked against the state, so a NSW query
with a Victorian postcode still returns NSW statewide services. A record
without `problems` is served for every problem. A JSON-RPC response from a
client (no `method`) gets -32600, not 202.
