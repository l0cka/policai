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
| `GET` | `/api/agencies` | List public agency records. |
| `GET` | `/api/network` | Get policy network nodes and edges. |
| `GET` | `/api/status` | Get collection health and freshness data. |

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

### HTTP behavior

All API endpoints have these controls:

- Cross-origin access for public, non-credentialed requests.
- A limit of 60 requests per minute for each IP address and route.
- A `Retry-After` header on `429` responses.
- Shared-cache freshness of five minutes, with stale responses permitted during refresh.
- A `400` response for invalid filters.

Set `POLICAI_CORS_ORIGIN` on the server to restrict cross-origin access to one origin. The default permits all origins.

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
| `search_developments` | Search compact development summaries. |
| `list_timeline` | List compact timeline events. |
| `list_agencies` | List compact agency records. |
| `get_status` | Get collection health and freshness data. |

All tools are read-only and idempotent. Search and list tools return compact records to reduce agent context use.

## Editorial boundary

`npm run mcp` starts the separate editorial source-ingest server. Keep that server local. It can access staged reviews and contains mutation tools that require `POLICAI_MCP_ADMIN_TOKEN`.

The public server does not expose these editorial tools or staged records.
