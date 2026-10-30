# Public API and MCP

Policai provides public, read-only access to its verified register and developments feed. The public services do not expose editorial reviews or mutation tools.

## Public API

Use this base URL:

```text
https://policai.org/api
```

Successful list responses use this form:

```json
{
  "data": [],
  "total": 0,
  "success": true
}
```

Error responses use this form:

```json
{
  "error": "Error description",
  "success": false
}
```

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/policies` | Search public policy records. |
| `GET` | `/api/policies/{id}` | Get one public policy record. |
| `GET` | `/api/developments` | Search public policy developments. |
| `GET` | `/api/timeline` | List public timeline events. |
| `GET` | `/api/legislation` | List public bills, Acts and instruments with their lifecycle events and stage. |
| `GET` | `/api/agencies` | List public agency records. |
| `GET` | `/api/network` | Get policy nodes and shared-theme edges. Stable; no site page uses it since `/network` became the coverage map. |
| `GET` | `/api/status` | Get collection health and freshness data. |
| `GET` | `/api/signal/reviews/{id}` | Signal dry-run for one staged review (Bearer `POLICAI_SIGNAL_TOKEN`). |
| `POST` | `/api/signal/reviews` | Signal dismiss with attestation (same token). Signal cannot approve. |

The Signal routes are the only public-site write API. They are not part of the
anonymous public register API. See [collector.md](./collector.md#policai-signal-grok-bot).

### Policy filters

`GET /api/policies` accepts these query parameters:

| Parameter | Values |
| --- | --- |
| `search` | Text with a maximum length of 200 characters. |
| `jurisdiction` | `federal`, `nsw`, `vic`, `qld`, `wa`, `sa`, `tas`, `act`, or `nt`. |
| `type` | A Policai policy type, such as `legislation`, `framework`, or `practice_note`. |
| `status` | `proposed`, `active`, `amended`, `superseded`, `closed`, or `repealed`. |

Example:

```bash
curl 'https://policai.org/api/policies?jurisdiction=federal&type=framework&search=assurance'
```

Each policy record has `themes`, 1 to 5 keys from the controlled list in
`src/lib/themes.ts` (for example `courts-tribunals`), and `tags`, free-form
keywords. `/data/policies.json`, `/api/policies`, `/api/policies/{id}` and the
public `search_policies` tool all include `themes`. `/api/network` nodes carry
`themes`; an edge's `sharedThemes` lists the shared themes' labels.

### Development filters

`GET /api/developments` accepts these query parameters:

| Parameter | Values |
| --- | --- |
| `search` | Text with a maximum length of 200 characters. |
| `jurisdiction` | A supported jurisdiction code. |
| `status` | `detected` or `promoted`. |
| `since` | An ISO 8601 date or timestamp. |
| `limit` | An integer from 1 through 100. The default is 50. |

Example:

```bash
curl 'https://policai.org/api/developments?since=2026-08-01&limit=20'
```

### Agency and timeline filters

`GET /api/agencies` accepts `level`, `jurisdiction`, and `commonwealth`. The `level` value is `federal` or `state`. The `commonwealth` value is `true` or `false`.

`GET /api/timeline` accepts `jurisdiction`.

### Legislation filters

`GET /api/legislation` returns public register records that carry
`legislative`: each record's official id and dated, sourced lifecycle events.
Each record also has `stage`, derived from its events: `before_parliament`,
`made` (assented or registered, not yet commenced), `in_force`, or `ended`
(lapsed, withdrawn, negatived, disallowed or repealed). It accepts
`jurisdiction` and `stage`.

```bash
curl 'https://policai.org/api/legislation?stage=before_parliament'
```

`GET /api/policies/{id}/markdown` returns one public register record as
`text/markdown`. The document carries its own provenance: the official source
URL, verification status and check date, last editorial review, and the
Policai record URL. A record with no editorial review since publication says
so explicitly. Records that are not public return the same JSON 404 as
`GET /api/policies/{id}`.

### Status fields

`GET /api/status` returns the last run's health in `collection`. It also returns two per-source freshness counts, computed from each source's last *completed* check in `data/watch-state.json`:

| Field | Meaning |
| --- | --- |
| `overdueSourceCount` | Automatic sources whose last completed check is older than 3 days (daily sources) or 10 days (weekly sources). |
| `neverCheckedSourceCount` | Automatic sources with no recorded completed check. |

A run can reach a source without completing its check, for example while a changed document waits for editorial review. When that happens, `collection.health` can be `healthy` while `overdueSourceCount` is above zero. The per-source detail is at [`/status`](https://policai.org/status).

The `records` object reports how long ago public register records were re-verified. It uses `lastReviewedAt`, and falls back to `verification.checkedAt` when a record has no review stamp. It is information only; no build or deploy fails because a record is old.

| Field | Meaning |
| --- | --- |
| `publicCount` | Public register records. |
| `overdueReviewCount` | Public records last verified more than 90 days ago. They stay public with verification status `stale` ("Review due"). |
| `oldestReviewAgeDays` | Days since the least recently verified public record, or `null` when there are none. |
| `completeCount` | Public records carrying every expected (not required) field. |
| `missingExpectedFields` | Per expected field (`agencies`, `tags`, `primaryDateSource`, `reviewStamp`), how many public records lack it. |

### HTTP behavior

All API endpoints have these controls:

- Cross-origin access for public, non-credentialed requests.
- A limit of 60 requests per minute for each IP address and route.
- A `Retry-After` header on `429` responses.
- Shared-cache freshness of five minutes, with stale responses permitted during refresh.
- A `400` response for invalid filters.

Set `POLICAI_CORS_ORIGIN` on the server to restrict cross-origin access to one origin. The default permits all origins.

## Feeds

`/feed.xml` is an Atom feed of public developments (also linked from
`/developments` and `/this-week`; `/developments/feed.xml` permanently
redirects there). There is no separate developments-only Atom path;
`/feed.xml` is that feed. `/analysis/feed.xml` is an Atom feed of published
analysis pieces. Both read through `data-service.ts`, so withheld developments
and drafts never appear. Every interpolated value is escaped with `escapeXml`
(`src/lib/xml.ts`), including text from third-party pages, so a feed is always
well-formed XML. Machine clients that prefer JSON can use `GET /api/developments`.

The public site lists these feeds and the JSON endpoints under
[Machine feeds and API](https://policai.org/methodology#machine-feeds) on
`/methodology`, with a short index on `/status`.

## Public MCP server

The public MCP server uses the public API. It does not read editorial files and does not accept an admin token.

### Start the server

Clone this repository and install its dependencies. Then run:

```bash
npm run mcp:public
```

The server uses `https://policai.org` by default. For local API development, run:

```bash
POLICAI_API_BASE_URL=http://localhost:3000 npm run mcp:public
```

Use the command, arguments, and repository path in your MCP client configuration:

```json
{
  "command": "npm",
  "args": ["run", "mcp:public"],
  "cwd": "/absolute/path/to/policai"
}
```

### Tools

| Tool | Purpose |
| --- | --- |
| `search_policies` | Search compact policy summaries. |
| `get_policy` | Get one complete policy record. |
| `search_court_requirements` | Search reviewer-verified court requirements with source anchors. |
| `search_developments` | Search compact development summaries. |
| `list_timeline` | List compact timeline events. |
| `list_agencies` | List compact agency records. |
| `get_status` | Get collection health and freshness data. |

All tools are read-only and idempotent. Search and list tools return compact records to reduce agent context use.

## Editorial boundary

`npm run mcp` starts the separate editorial source-ingest server. Keep that server local. It can access staged reviews. Its mutation tools are registered only when the server starts with `POLICAI_MCP_WRITE=1`; no tool takes a secret argument, so nothing secret reaches the agent's context. Use `list_court_requirement_candidates` to inspect extracted propositions and `review_court_requirement` to verify or reject one with a named human reviewer and review notes. A reviewer may correct the actor, modality, action, conditions, exceptions or topics; the source URL, hash, quote and pinpoint remain immutable. Reject and re-extract a candidate when its source anchor is wrong. Verified requirements flow to the Courts page and public agent tools; pending and rejected candidates remain editorial.

The public server does not expose these editorial tools or staged records.
