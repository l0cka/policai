# Pro Bono Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted monitor of the Australian Pro Bono sector: daily agent-driven ingest into Postgres, a Tailscale-private Next.js dashboard, and a Sunday 18:00 AEST digest email.

**Architecture:** Four units that only talk to Postgres: a deterministic worker (fetch/dedupe/DB I/O, TypeScript scripts), a Claude Code agent routine that supplies judgement (classification, blurbs, opportunity flags) by calling worker scripts, a Next.js dashboard, and a digest mailer. Deployed to `/home/l0cka/services/probono-radar/src/` on Argus via docker-compose; ingest and digest run from systemd user timers.

**Tech Stack:** TypeScript, Node 22, tsx (no build step for worker), Postgres 16, `pg`, `rss-parser`, `zod`, `nodemailer`, `vitest`, Next.js 15 (App Router, standalone output), Docker Compose, systemd user units, Claude Code CLI headless, self-hosted Firecrawl (already on Argus).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-probono-radar-design.md`. It wins on any conflict.
- Streams enum, exact strings everywhere: `news`, `law_reform`, `funding`, `tech_justice`.
- Store excerpts only, never full article text. Excerpt cap: 700 characters.
- Timestamps stored UTC; rendered as `Australia/Sydney` in dashboard and digest.
- Host ports on Argus and local dev: Postgres `127.0.0.1:5433`, dashboard `127.0.0.1:8850`. Nothing binds a public interface.
- Secrets only in `.env` (gitignored); `.env.example` lists every variable. No Anthropic API key anywhere — enrichment uses the authenticated `claude` CLI on Argus.
- **Local dev machine gotcha:** nvm's lazy-loader breaks `node`/`npm`/`npx` in non-interactive shells (FUNCNEST error). Always call binaries directly: `NODEBIN=$(ls -d ~/.nvm/versions/node/*/bin | tail -1)` then `$NODEBIN/npm`, `$NODEBIN/node`. Every Run step below assumes `$NODEBIN` is set.
- Argus is production-like: no ad-hoc mutation over SSH. All Argus changes go through `ops/deploy.sh` and the documented systemd install steps in Task 9, run with the user aware (Argus approval policy).
- Commit after every task (steps include it). Branch: `spec` worktree at `/Users/l0cka/Projects/probono-radar/.claude/worktrees/spec`.

---

### Task 1: Repo scaffold, Postgres service, schema, seed sources

**Files:**
- Create: `docker-compose.yaml`
- Create: `.env.example`
- Create: `db/schema.sql`
- Create: `db/seed.sql`
- Create: `README.md`

**Interfaces:**
- Produces: running Postgres 16 at `postgres://radar:<pw>@127.0.0.1:5433/radar` with tables `sources`, `items`, `ingest_runs`, `digests`, `tags`, `item_tags`. All later tasks connect via env `DATABASE_URL`.

- [ ] **Step 1: Write `docker-compose.yaml`**

```yaml
name: probono-radar

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: radar
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: radar
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U radar -d radar"]
      interval: 5s
      timeout: 3s
      retries: 10

  dashboard:
    build: ./dashboard
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://radar:${POSTGRES_PASSWORD}@db:5432/radar
      TZ: Australia/Sydney
    ports:
      - "127.0.0.1:8850:3000"

  # Worker is run on demand (systemd timers / manual), never long-running.
  # network_mode host lets it reach Postgres (127.0.0.1:5433) and the
  # existing Firecrawl instance on the Argus host. On macOS dev, skip the
  # container and run scripts directly with tsx.
  worker:
    build: ./worker
    profiles: ["worker"]
    network_mode: host
    environment:
      DATABASE_URL: postgres://radar:${POSTGRES_PASSWORD}@127.0.0.1:5433/radar
      FIRECRAWL_URL: ${FIRECRAWL_URL:-http://127.0.0.1:3002}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      DIGEST_TO: ${DIGEST_TO:-}
      DASHBOARD_URL: ${DASHBOARD_URL:-http://100.87.255.67:8850}
      TZ: Australia/Sydney

volumes:
  pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```bash
# copy to .env and fill in; .env is gitignored
POSTGRES_PASSWORD=change-me
# Firecrawl API base on the Argus host (verify port during deploy)
FIRECRAWL_URL=http://127.0.0.1:3002
# Gmail SMTP for the weekly digest (app password, not account password)
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
DIGEST_TO=you@gmail.com
# Where digest links point (Tailscale address of dashboard)
DASHBOARD_URL=http://100.87.255.67:8850
```

- [ ] **Step 3: Write `db/schema.sql`**

```sql
-- Pro Bono Radar schema. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS sources (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL UNIQUE,
  fetch_method      TEXT NOT NULL CHECK (fetch_method IN ('rss', 'firecrawl')),
  -- regex a listing-page link must match to count as an item (firecrawl sources)
  item_link_pattern TEXT,
  stream_hint       TEXT CHECK (stream_hint IN ('news', 'law_reform', 'funding', 'tech_justice')),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id                 SERIAL PRIMARY KEY,
  source_id          INTEGER NOT NULL REFERENCES sources(id),
  url                TEXT NOT NULL,
  canonical_url      TEXT NOT NULL UNIQUE,        -- primary dedupe key
  title              TEXT NOT NULL,
  published_at       TIMESTAMPTZ,
  excerpt            TEXT CHECK (char_length(excerpt) <= 700),
  content_hash       TEXT,                        -- sha256(title + excerpt), secondary dedupe
  stream             TEXT CHECK (stream IN ('news', 'law_reform', 'funding', 'tech_justice')),
  blurb              TEXT,
  opportunity        BOOLEAN NOT NULL DEFAULT FALSE,
  opportunity_reason TEXT,
  entities           JSONB,                       -- {organisations:[], deadlines:[{date,label}], amounts:[]}
  enriched_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  search             TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(blurb, ''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS items_search_idx ON items USING GIN (search);
CREATE INDEX IF NOT EXISTS items_stream_idx ON items (stream);
CREATE INDEX IF NOT EXISTS items_created_idx ON items (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS items_content_hash_idx ON items (content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest_runs (
  id             SERIAL PRIMARY KEY,
  run_started_at TIMESTAMPTZ NOT NULL,
  source_id      INTEGER NOT NULL REFERENCES sources(id),
  status         TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
  items_found    INTEGER NOT NULL DEFAULT 0,
  items_new      INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingest_runs_source_idx ON ingest_runs (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS digests (
  id           SERIAL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  item_ids     INTEGER[] NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
```

- [ ] **Step 4: Write `db/seed.sql`**

URLs are best-known as of 2026-08-07; the deploy smoke test (Task 9) verifies each and failures surface in `ingest_runs` by design.

```sql
INSERT INTO sources (name, url, fetch_method, item_link_pattern, stream_hint) VALUES
  ('Pro Bono Australia',            'https://probonoaustralia.com.au/feed/',        'rss',       NULL,                    'news'),
  ('ALRC News',                     'https://www.alrc.gov.au/feed/',                'rss',       NULL,                    'law_reform'),
  ('Artificial Lawyer',             'https://www.artificiallawyer.com/feed/',       'rss',       NULL,                    'tech_justice'),
  ('Australian Pro Bono Centre',    'https://probonocentre.org.au/news/',           'firecrawl', 'probonocentre\.org\.au/(?!news/?$)', 'news'),
  ('Justice Connect',               'https://justiceconnect.org.au/about-us/news/', 'firecrawl', 'justiceconnect\.org\.au/(news|stories)/.+', 'news'),
  ('CLCs Australia',                'https://clcs.org.au/news',                     'firecrawl', 'clcs\.org\.au/.+',      'news'),
  ('AGD Consultations',             'https://consultations.ag.gov.au/',             'firecrawl', 'consultations\.ag\.gov\.au/.+', 'law_reform'),
  ('Victorian Law Reform Commission','https://www.lawreform.vic.gov.au/news/',      'firecrawl', 'lawreform\.vic\.gov\.au/.+', 'law_reform'),
  ('NSW Law Reform Commission',     'https://lawreform.nsw.gov.au/',                'firecrawl', 'lawreform\.nsw\.gov\.au/.+', 'law_reform'),
  ('National Legal Aid',            'https://www.nationallegalaid.org/news/',       'firecrawl', 'nationallegalaid\.org/.+', 'funding'),
  ('Law Council Media',             'https://lawcouncil.au/media',                  'firecrawl', 'lawcouncil\.au/media/.+', 'news'),
  ('GrantConnect Forecasts',        'https://www.grants.gov.au/Go/List',            'firecrawl', 'grants\.gov\.au/Go/.+', 'funding')
ON CONFLICT (url) DO NOTHING;
```

- [ ] **Step 5: Write `README.md`**

```markdown
# Pro Bono Radar

Monitors the Australian Pro Bono sector. Daily agent-driven ingest into
Postgres, Tailscale-private dashboard, Sunday 18:00 AEST digest email.

Spec: docs/superpowers/specs/2026-08-07-probono-radar-design.md

## Local dev
1. `cp .env.example .env` and set POSTGRES_PASSWORD.
2. `docker compose up -d db`
3. Apply schema: see below.
4. Worker: `cd worker && $NODEBIN/npm install && $NODEBIN/npx tsx src/fetch-all.ts`
5. Dashboard: `cd dashboard && $NODEBIN/npm install && $NODEBIN/npm run dev`

Apply schema/seed:
`docker compose exec -T db psql -U radar -d radar < db/schema.sql`
`docker compose exec -T db psql -U radar -d radar < db/seed.sql`

## Production (Argus)
`/home/l0cka/services/probono-radar/src/`, deployed by `ops/deploy.sh`.
Ingest: systemd user timer `probono-ingest.timer` (daily 06:00 Sydney).
Digest: `probono-digest.timer` (Sun 18:00 Sydney). See ops/.
```

- [ ] **Step 6: Boot Postgres and apply schema + seed**

Run:
```bash
cp .env.example .env && sed -i '' 's/change-me/dev-only-password/' .env
docker compose up -d db && sleep 6
docker compose exec -T db psql -U radar -d radar < db/schema.sql
docker compose exec -T db psql -U radar -d radar < db/seed.sql
docker compose exec -T db psql -U radar -d radar -c "SELECT count(*) FROM sources;"
```
Expected: `count` = 12, no errors.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yaml .env.example db/ README.md
git commit -m "feat: scaffold compose, schema, seed sources"
```

---

### Task 2: Worker package, DB helper, shared types

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/Dockerfile`
- Create: `worker/src/lib/db.ts`
- Create: `worker/src/lib/types.ts`
- Create: `worker/test/types.test.ts`

**Interfaces:**
- Produces: `getPool(): pg.Pool` (reads `DATABASE_URL`); `EnrichmentSchema` (zod) with type `Enrichment = { stream: 'news'|'law_reform'|'funding'|'tech_justice', blurb: string, opportunity: boolean, opportunity_reason: string | null, entities: { organisations: string[], deadlines: {date: string, label: string}[], amounts: string[] }, excerpt: string | null }`; `STREAMS` const. Tasks 3–5 import these.

- [ ] **Step 1: Write `worker/package.json`**

```json
{
  "name": "probono-radar-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "fetch": "tsx src/fetch-all.ts",
    "digest": "tsx src/digest.ts"
  },
  "dependencies": {
    "nodemailer": "^6.9.14",
    "pg": "^8.12.0",
    "rss-parser": "^3.13.0",
    "tsx": "^4.19.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/nodemailer": "^6.4.15",
    "@types/pg": "^8.11.6",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `worker/Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY tsconfig.json ./
ENTRYPOINT ["npx", "tsx"]
```

- [ ] **Step 4: Write `worker/src/lib/types.ts`**

```typescript
import { z } from 'zod';

export const STREAMS = ['news', 'law_reform', 'funding', 'tech_justice'] as const;
export type Stream = (typeof STREAMS)[number];

export const EnrichmentSchema = z.object({
  stream: z.enum(STREAMS),
  blurb: z.string().min(20).max(600),
  opportunity: z.boolean(),
  opportunity_reason: z.string().max(300).nullable(),
  entities: z.object({
    organisations: z.array(z.string()).default([]),
    deadlines: z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string() }))
      .default([]),
    amounts: z.array(z.string()).default([]),
  }),
  excerpt: z.string().max(700).nullable(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;
```

- [ ] **Step 5: Write `worker/src/lib/db.ts`**

```typescript
import pg from 'pg';

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
```

- [ ] **Step 6: Write the failing test `worker/test/types.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { EnrichmentSchema } from '../src/lib/types.js';

describe('EnrichmentSchema', () => {
  it('accepts a valid enrichment payload', () => {
    const parsed = EnrichmentSchema.parse({
      stream: 'funding',
      blurb: 'The Commonwealth opened a new NLAP top-up round for community legal centres.',
      opportunity: true,
      opportunity_reason: 'G+T could assist CLC applicants with grant agreements.',
      entities: {
        organisations: ['Attorney-General’s Department'],
        deadlines: [{ date: '2026-09-30', label: 'Applications close' }],
        amounts: ['$12m'],
      },
      excerpt: null,
    });
    expect(parsed.stream).toBe('funding');
  });

  it('rejects an unknown stream and an over-long excerpt', () => {
    expect(() => EnrichmentSchema.parse({ stream: 'sport', blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: null })).toThrow();
    expect(() => EnrichmentSchema.parse({ stream: 'news', blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: 'x'.repeat(701) })).toThrow();
  });
});
```

- [ ] **Step 7: Install and run tests**

Run: `cd worker && $NODEBIN/npm install && $NODEBIN/npm test`
Expected: both tests PASS (schema exists by the time tests run; the "failing first" cycle here is the install/module-resolution check).

- [ ] **Step 8: Commit**

```bash
git add worker/
git commit -m "feat: worker scaffold with db pool and enrichment schema"
```

---

### Task 3: Fetchers and fetch-all (dedupe + ingest_runs)

**Files:**
- Create: `worker/src/lib/canonical.ts`
- Create: `worker/src/lib/fetch-rss.ts`
- Create: `worker/src/lib/fetch-firecrawl.ts`
- Create: `worker/src/fetch-all.ts`
- Create: `worker/test/canonical.test.ts`
- Create: `worker/test/fetch-firecrawl.test.ts`
- Create: `worker/test/fixtures/probono-australia.rss.xml` (canned RSS, 3 items)
- Create: `worker/test/fetch-all.integration.test.ts`

**Interfaces:**
- Consumes: `getPool`, `closePool` from Task 2.
- Produces: `canonicalizeUrl(raw: string): string`; `fetchRss(feedXmlUrl: string): Promise<RawItem[]>`; `extractListingLinks(markdown: string, baseUrl: string, itemLinkPattern: string): RawItem[]`; `fetchFirecrawl(url: string, itemLinkPattern: string): Promise<RawItem[]>` where `RawItem = { url: string, title: string, published_at: string | null, excerpt: string | null }`. CLI: `tsx src/fetch-all.ts` prints JSON `{ run_started_at, sources: [{ source_id, name, status, items_found, items_new, error }] }` to stdout, exit 0 even when some sources fail, exit 1 only if the run itself cannot start.

- [ ] **Step 1: Write failing tests `worker/test/canonical.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from '../src/lib/canonical.js';

describe('canonicalizeUrl', () => {
  it('strips tracking params, fragments, trailing slash; lowercases host', () => {
    expect(canonicalizeUrl('HTTPS://ProBono.ORG.au/News/Post/?utm_source=x&utm_campaign=y#top'))
      .toBe('https://probono.org.au/News/Post');
  });
  it('keeps meaningful query params', () => {
    expect(canonicalizeUrl('https://grants.gov.au/Go/Show?GoUuid=abc'))
      .toBe('https://grants.gov.au/Go/Show?GoUuid=abc');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd worker && $NODEBIN/npm test -- canonical`
Expected: FAIL — cannot resolve `../src/lib/canonical.js`.

- [ ] **Step 3: Implement `worker/src/lib/canonical.ts`**

```typescript
const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid)/;

export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) u.searchParams.delete(key);
  }
  let s = u.toString();
  if (u.search === '' && s.includes('?')) s = s.replace(/\?$/, '');
  return s.replace(/\/$/, '');
}
```

- [ ] **Step 4: Run canonical tests — expect PASS.**

Run: `cd worker && $NODEBIN/npm test -- canonical`

- [ ] **Step 5: Write `worker/test/fixtures/probono-australia.rss.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Pro Bono Australia</title>
  <item>
    <title>New NLAP funding round announced</title>
    <link>https://probonoaustralia.com.au/news/2026/08/nlap-round/?utm_source=rss</link>
    <pubDate>Mon, 03 Aug 2026 01:00:00 GMT</pubDate>
    <description>The Commonwealth has announced a top-up round for community legal centres.</description>
  </item>
  <item>
    <title>Justice Connect launches AI intake tool</title>
    <link>https://probonoaustralia.com.au/news/2026/08/jc-ai-intake/</link>
    <pubDate>Tue, 04 Aug 2026 01:00:00 GMT</pubDate>
    <description>A new AI-assisted intake triage tool for self-represented litigants.</description>
  </item>
  <item>
    <title>Pro bono hours hit record in FY26</title>
    <link>https://probonoaustralia.com.au/news/2026/08/hours-record/</link>
    <pubDate>Wed, 05 Aug 2026 01:00:00 GMT</pubDate>
    <description>The national pro bono target survey shows record participation.</description>
  </item>
</channel></rss>
```

- [ ] **Step 6: Write failing test `worker/test/fetch-firecrawl.test.ts`** (covers link extraction; RSS parsing is exercised in the integration test via the fixture file)

```typescript
import { describe, expect, it } from 'vitest';
import { extractListingLinks } from '../src/lib/fetch-firecrawl.js';

const MD = `
# News
[Federal budget boosts legal aid](https://clcs.org.au/news/budget-boost)
[About us](https://clcs.org.au/about)
[Sector snapshot 2026](/news/sector-snapshot-2026)
[Donate](https://donate.example.org/clcs)
`;

describe('extractListingLinks', () => {
  it('keeps only links matching item_link_pattern, resolves relative URLs', () => {
    const items = extractListingLinks(MD, 'https://clcs.org.au/news', 'clcs\\.org\\.au/news/.+');
    expect(items.map((i) => i.url)).toEqual([
      'https://clcs.org.au/news/budget-boost',
      'https://clcs.org.au/news/sector-snapshot-2026',
    ]);
    expect(items[0].title).toBe('Federal budget boosts legal aid');
    expect(items[0].excerpt).toBeNull();
  });
});
```

- [ ] **Step 7: Run to verify failure, then implement `worker/src/lib/fetch-firecrawl.ts`**

Run: `cd worker && $NODEBIN/npm test -- firecrawl` → FAIL (module not found).

```typescript
export type RawItem = {
  url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
};

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function extractListingLinks(markdown: string, baseUrl: string, itemLinkPattern: string): RawItem[] {
  const pattern = new RegExp(itemLinkPattern);
  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const m of markdown.matchAll(LINK_RE)) {
    const title = m[1].trim();
    let url: string;
    try {
      url = new URL(m[2], baseUrl).toString();
    } catch {
      continue;
    }
    if (!pattern.test(url) || seen.has(url) || title.length < 8) continue;
    seen.add(url);
    items.push({ url, title, published_at: null, excerpt: null });
  }
  return items;
}

export async function fetchFirecrawl(url: string, itemLinkPattern: string): Promise<RawItem[]> {
  const base = process.env.FIRECRAWL_URL ?? 'http://127.0.0.1:3002';
  const res = await fetch(`${base}/v1/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer self-hosted' },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status} for ${url}`);
  const body = (await res.json()) as { data?: { markdown?: string } };
  const markdown = body.data?.markdown;
  if (!markdown) throw new Error(`firecrawl returned no markdown for ${url}`);
  return extractListingLinks(markdown, url, itemLinkPattern);
}
```

- [ ] **Step 8: Run firecrawl tests — expect PASS.**

- [ ] **Step 9: Implement `worker/src/lib/fetch-rss.ts`**

```typescript
import Parser from 'rss-parser';
import type { RawItem } from './fetch-firecrawl.js';

const parser = new Parser({ timeout: 30_000 });

export async function fetchRss(feedUrl: string): Promise<RawItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []).flatMap((it) => {
    if (!it.link || !it.title) return [];
    return [{
      url: it.link,
      title: it.title.trim(),
      published_at: it.isoDate ?? null,
      excerpt: (it.contentSnippet ?? '').slice(0, 700) || null,
    }];
  });
}

// Test seam: parse a local XML string instead of a URL.
export async function parseRssString(xml: string): Promise<RawItem[]> {
  const feed = await parser.parseString(xml);
  return (feed.items ?? []).flatMap((it) => {
    if (!it.link || !it.title) return [];
    return [{
      url: it.link,
      title: it.title.trim(),
      published_at: it.isoDate ?? null,
      excerpt: (it.contentSnippet ?? '').slice(0, 700) || null,
    }];
  });
}
```

- [ ] **Step 10: Implement `worker/src/fetch-all.ts`**

```typescript
import { createHash } from 'node:crypto';
import { canonicalizeUrl } from './lib/canonical.js';
import { closePool, getPool } from './lib/db.js';
import { fetchFirecrawl, type RawItem } from './lib/fetch-firecrawl.js';
import { fetchRss } from './lib/fetch-rss.js';

type SourceRow = {
  id: number;
  name: string;
  url: string;
  fetch_method: 'rss' | 'firecrawl';
  item_link_pattern: string | null;
};

export async function ingestSource(source: SourceRow, runStartedAt: string) {
  const pool = getPool();
  let found = 0;
  let inserted = 0;
  try {
    const raw: RawItem[] =
      source.fetch_method === 'rss'
        ? await fetchRss(source.url)
        : await fetchFirecrawl(source.url, source.item_link_pattern ?? '.+');
    found = raw.length;
    for (const item of raw) {
      const canonical = canonicalizeUrl(item.url);
      const hash = item.excerpt
        ? createHash('sha256').update(item.title + item.excerpt).digest('hex')
        : null;
      const res = await pool.query(
        `INSERT INTO items (source_id, url, canonical_url, title, published_at, excerpt, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [source.id, item.url, canonical, item.title, item.published_at, item.excerpt, hash],
      );
      inserted += res.rowCount ?? 0;
    }
    await pool.query(
      `INSERT INTO ingest_runs (run_started_at, source_id, status, items_found, items_new)
       VALUES ($1, $2, 'ok', $3, $4)`,
      [runStartedAt, source.id, found, inserted],
    );
    return { source_id: source.id, name: source.name, status: 'ok' as const, items_found: found, items_new: inserted, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `INSERT INTO ingest_runs (run_started_at, source_id, status, items_found, items_new, error)
       VALUES ($1, $2, 'failed', $3, $4, $5)`,
      [runStartedAt, source.id, found, inserted, message.slice(0, 1000)],
    );
    return { source_id: source.id, name: source.name, status: 'failed' as const, items_found: found, items_new: inserted, error: message };
  }
}

async function main() {
  const pool = getPool();
  const runStartedAt = new Date().toISOString();
  const { rows: sources } = await pool.query<SourceRow>(
    `SELECT id, name, url, fetch_method, item_link_pattern FROM sources WHERE active ORDER BY id`,
  );
  const results = [];
  for (const source of sources) results.push(await ingestSource(source, runStartedAt));
  console.log(JSON.stringify({ run_started_at: runStartedAt, sources: results }, null, 2));
  await closePool();
}

const isDirectRun = process.argv[1]?.endsWith('fetch-all.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 11: Write integration test `worker/test/fetch-all.integration.test.ts`** (needs `docker compose up -d db` and schema applied; uses the RSS fixture through `parseRssString` and exercises dedupe through `ingestSource` with a stubbed fetch via a file:// trick — instead, test the two DB-critical behaviours directly)

```typescript
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';
import { parseRssString } from '../src/lib/fetch-rss.js';
import { canonicalizeUrl } from '../src/lib/canonical.js';

// Requires: docker compose up -d db && schema applied.
// DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar

describe('ingest pipeline (integration)', () => {
  let sourceId: number;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM ingest_runs; DELETE FROM item_tags; DELETE FROM items;`);
    const { rows } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture', 'https://fixture.test/feed', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture' RETURNING id`,
    );
    sourceId = rows[0].id;
  });

  afterAll(async () => closePool());

  it('parses the RSS fixture into RawItems', async () => {
    const xml = readFileSync(new URL('./fixtures/probono-australia.rss.xml', import.meta.url), 'utf8');
    const items = await parseRssString(xml);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('New NLAP funding round announced');
    expect(items[0].excerpt).toContain('top-up round');
  });

  it('dedupes on canonical_url via ON CONFLICT DO NOTHING', async () => {
    const pool = getPool();
    const canonical = canonicalizeUrl('https://fixture.test/news/one/?utm_source=rss');
    const insert = (url: string) =>
      pool.query(
        `INSERT INTO items (source_id, url, canonical_url, title) VALUES ($1, $2, $3, 'One')
         ON CONFLICT DO NOTHING`,
        [sourceId, url, canonical],
      );
    const first = await insert('https://fixture.test/news/one/?utm_source=rss');
    const second = await insert('https://fixture.test/news/one/');
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0);
  });
});
```

- [ ] **Step 12: Run all worker tests**

Run:
```bash
docker compose up -d db
cd worker && DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npm test
```
Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add worker/
git commit -m "feat: rss and firecrawl fetchers with dedupe and run logging"
```

---

### Task 4: Enrichment I/O scripts (the agent's hands)

**Files:**
- Create: `worker/src/list-unenriched.ts`
- Create: `worker/src/save-enrichment.ts`
- Create: `worker/test/save-enrichment.integration.test.ts`

**Interfaces:**
- Consumes: `getPool`/`closePool`, `EnrichmentSchema` (Task 2).
- Produces: CLI `tsx src/list-unenriched.ts` → stdout JSON `[{ id, title, url, excerpt, source_name, stream_hint, published_at }]` (max 40, oldest first). CLI `tsx src/save-enrichment.ts <item_id>` reading one JSON `Enrichment` object on stdin; validates with `EnrichmentSchema`; exit 0 on save, exit 2 on validation error (message on stderr). The RUNBOOK (Task 6) depends on these exact commands.

- [ ] **Step 1: Implement `worker/src/list-unenriched.ts`**

```typescript
import { closePool, getPool } from './lib/db.js';

async function main() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.url, i.excerpt, i.published_at, s.name AS source_name, s.stream_hint
     FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.enriched_at IS NULL
     ORDER BY i.created_at ASC
     LIMIT 40`,
  );
  console.log(JSON.stringify(rows, null, 2));
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Implement `worker/src/save-enrichment.ts`**

```typescript
import { closePool, getPool } from './lib/db.js';
import { EnrichmentSchema } from './lib/types.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const itemId = Number(process.argv[2]);
  if (!Number.isInteger(itemId)) {
    console.error('usage: tsx src/save-enrichment.ts <item_id>  (JSON Enrichment on stdin)');
    process.exit(2);
  }
  const parsed = EnrichmentSchema.safeParse(JSON.parse(await readStdin()));
  if (!parsed.success) {
    console.error(`validation failed: ${parsed.error.message}`);
    process.exit(2);
  }
  const e = parsed.data;
  const pool = getPool();
  const res = await pool.query(
    `UPDATE items SET stream = $2, blurb = $3, opportunity = $4, opportunity_reason = $5,
       entities = $6, excerpt = COALESCE($7, excerpt), enriched_at = now()
     WHERE id = $1`,
    [itemId, e.stream, e.blurb, e.opportunity, e.opportunity_reason, JSON.stringify(e.entities), e.excerpt],
  );
  if (res.rowCount === 0) {
    console.error(`no item with id ${itemId}`);
    process.exit(2);
  }
  console.log(`saved enrichment for item ${itemId}`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Write failing integration test `worker/test/save-enrichment.integration.test.ts`**

```typescript
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';

const DB = 'postgres://radar:dev-only-password@127.0.0.1:5433/radar';

describe('save-enrichment CLI (integration)', () => {
  let itemId: number;

  beforeAll(async () => {
    const pool = getPool();
    const { rows: src } = await pool.query(
      `INSERT INTO sources (name, url, fetch_method) VALUES ('fixture2', 'https://fixture2.test', 'rss')
       ON CONFLICT (url) DO UPDATE SET name = 'fixture2' RETURNING id`,
    );
    const { rows } = await pool.query(
      `INSERT INTO items (source_id, url, canonical_url, title)
       VALUES ($1, 'https://fixture2.test/a', 'https://fixture2.test/a', 'Enrich me')
       ON CONFLICT (canonical_url) DO UPDATE SET title = 'Enrich me' RETURNING id`,
      [src[0].id],
    );
    itemId = rows[0].id;
  });

  afterAll(async () => closePool());

  it('saves a valid payload and stamps enriched_at', async () => {
    const payload = JSON.stringify({
      stream: 'tech_justice',
      blurb: 'A court digitisation pilot expands to two more registries this quarter.',
      opportunity: false,
      opportunity_reason: null,
      entities: { organisations: ['Federal Court'], deadlines: [], amounts: [] },
      excerpt: 'Pilot expands to two more registries.',
    });
    execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
      cwd: new URL('..', import.meta.url).pathname, input: payload,
      env: { ...process.env, DATABASE_URL: DB },
    });
    const { rows } = await getPool().query(`SELECT stream, enriched_at FROM items WHERE id = $1`, [itemId]);
    expect(rows[0].stream).toBe('tech_justice');
    expect(rows[0].enriched_at).not.toBeNull();
  });

  it('exits 2 on an invalid stream', () => {
    const bad = JSON.stringify({ stream: 'sport', blurb: 'x'.repeat(30), opportunity: false, opportunity_reason: null, entities: { organisations: [], deadlines: [], amounts: [] }, excerpt: null });
    expect(() =>
      execFileSync('npx', ['tsx', 'src/save-enrichment.ts', String(itemId)], {
        cwd: new URL('..', import.meta.url).pathname, input: bad,
        env: { ...process.env, DATABASE_URL: DB },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd worker && DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npm test -- save-enrichment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/
git commit -m "feat: enrichment list/save CLI with zod validation"
```

---

### Task 5: Digest compiler and mailer

**Files:**
- Create: `worker/src/lib/render-digest.ts`
- Create: `worker/src/digest.ts`
- Create: `worker/test/render-digest.test.ts`

**Interfaces:**
- Consumes: `getPool`/`closePool` (Task 2).
- Produces: `renderDigest(input: DigestInput): string` (HTML email body) where `DigestInput = { periodStart: Date, periodEnd: Date, dashboardUrl: string, opportunities: DigestItem[], byStream: Record<string, DigestItem[]>, deadlines: { date: string, label: string, itemTitle: string }[], failedSources: string[] }` and `DigestItem = { id, title, url, blurb, source_name }`. CLI `tsx src/digest.ts` compiles the last 7 days, sends via Gmail SMTP, records a `digests` row; exits non-zero (loudly) on any failure; with `--dry-run` prints HTML to stdout and sends/records nothing.

- [ ] **Step 1: Write failing test `worker/test/render-digest.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { renderDigest } from '../src/lib/render-digest.js';

const item = (id: number, title: string) => ({
  id, title, url: `https://example.org/${id}`, blurb: `Blurb for ${title}.`, source_name: 'Fixture',
});

describe('renderDigest', () => {
  it('puts opportunities first, groups streams, lists deadlines and failures', () => {
    const html = renderDigest({
      periodStart: new Date('2026-08-03T00:00:00Z'),
      periodEnd: new Date('2026-08-09T23:59:59Z'),
      dashboardUrl: 'http://100.87.255.67:8850',
      opportunities: [item(1, 'CLC seeks tech help')],
      byStream: { news: [item(2, 'Sector news piece')], funding: [item(3, 'Grant round opens')] },
      deadlines: [{ date: '2026-09-30', label: 'Applications close', itemTitle: 'Grant round opens' }],
      failedSources: ['NSW Law Reform Commission'],
    });
    expect(html.indexOf('CLC seeks tech help')).toBeLessThan(html.indexOf('Sector news piece'));
    expect(html).toContain('Opportunities');
    expect(html).toContain('Upcoming deadlines');
    expect(html).toContain('2026-09-30');
    expect(html).toContain('NSW Law Reform Commission');
    expect(html).toContain('http://100.87.255.67:8850');
  });

  it('omits the failure footer when nothing failed', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'http://x',
      opportunities: [], byStream: {}, deadlines: [], failedSources: [],
    });
    expect(html).not.toContain('Sources that failed');
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `worker/src/lib/render-digest.ts`**

```typescript
export type DigestItem = { id: number; title: string; url: string; blurb: string | null; source_name: string };
export type DigestInput = {
  periodStart: Date;
  periodEnd: Date;
  dashboardUrl: string;
  opportunities: DigestItem[];
  byStream: Record<string, DigestItem[]>;
  deadlines: { date: string; label: string; itemTitle: string }[];
  failedSources: string[];
};

const STREAM_LABELS: Record<string, string> = {
  news: 'News & announcements',
  law_reform: 'Law reform & policy',
  funding: 'Funding & grants',
  tech_justice: 'Tech & innovation in justice',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtSydney = (d: Date) =>
  d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' });

function itemHtml(i: DigestItem): string {
  return `<li style="margin-bottom:10px">
    <a href="${esc(i.url)}"><strong>${esc(i.title)}</strong></a>
    <span style="color:#666"> — ${esc(i.source_name)}</span>
    ${i.blurb ? `<br>${esc(i.blurb)}` : ''}
  </li>`;
}

export function renderDigest(input: DigestInput): string {
  const parts: string[] = [];
  parts.push(`<h1 style="font-size:18px">Pro Bono Radar — week of ${fmtSydney(input.periodStart)} to ${fmtSydney(input.periodEnd)}</h1>`);
  if (input.opportunities.length) {
    parts.push(`<h2 style="font-size:15px">⚑ Opportunities</h2><ul>${input.opportunities.map(itemHtml).join('')}</ul>`);
  }
  for (const [stream, items] of Object.entries(input.byStream)) {
    if (!items.length) continue;
    parts.push(`<h2 style="font-size:15px">${esc(STREAM_LABELS[stream] ?? stream)}</h2><ul>${items.map(itemHtml).join('')}</ul>`);
  }
  if (input.deadlines.length) {
    parts.push(`<h2 style="font-size:15px">Upcoming deadlines</h2><ul>${input.deadlines
      .map((d) => `<li><strong>${esc(d.date)}</strong> — ${esc(d.label)} (${esc(d.itemTitle)})</li>`)
      .join('')}</ul>`);
  }
  parts.push(`<p><a href="${esc(input.dashboardUrl)}">Open the dashboard</a></p>`);
  if (input.failedSources.length) {
    parts.push(`<p style="color:#a00;font-size:12px">Sources that failed this week: ${input.failedSources.map(esc).join(', ')}</p>`);
  }
  return `<div style="font-family:Georgia,serif;max-width:640px">${parts.join('\n')}</div>`;
}
```

- [ ] **Step 3: Run render tests — expect PASS.**

Run: `cd worker && $NODEBIN/npm test -- render-digest`

- [ ] **Step 4: Implement `worker/src/digest.ts`**

```typescript
import nodemailer from 'nodemailer';
import { closePool, getPool } from './lib/db.js';
import { renderDigest, type DigestItem } from './lib/render-digest.js';
import { STREAMS } from './lib/types.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = getPool();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 3600 * 1000);

  const { rows: items } = await pool.query(
    `SELECT i.id, i.title, i.url, i.blurb, i.stream, i.opportunity, i.entities, s.name AS source_name
     FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.created_at >= $1 ORDER BY i.opportunity DESC, i.created_at DESC`,
    [periodStart.toISOString()],
  );
  const { rows: failures } = await pool.query(
    `SELECT DISTINCT s.name FROM ingest_runs r JOIN sources s ON s.id = r.source_id
     WHERE r.status = 'failed' AND r.created_at >= $1`,
    [periodStart.toISOString()],
  );

  const opportunities = items.filter((i) => i.opportunity) as DigestItem[];
  const byStream: Record<string, DigestItem[]> = {};
  for (const s of STREAMS) byStream[s] = items.filter((i) => !i.opportunity && i.stream === s);
  const unclassified = items.filter((i) => !i.opportunity && !i.stream);
  if (unclassified.length) byStream['news'] = [...(byStream['news'] ?? []), ...unclassified];

  const deadlines = items
    .flatMap((i) => ((i.entities?.deadlines ?? []) as { date: string; label: string }[])
      .map((d) => ({ ...d, itemTitle: i.title as string })))
    .filter((d) => d.date >= periodEnd.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  const html = renderDigest({
    periodStart, periodEnd,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:8850',
    opportunities, byStream, deadlines,
    failedSources: failures.map((f) => f.name),
  });

  if (dryRun) {
    console.log(html);
    await closePool();
    return;
  }

  const { SMTP_USER, SMTP_PASS, DIGEST_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !DIGEST_TO) throw new Error('SMTP_USER, SMTP_PASS, DIGEST_TO must be set');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: `Pro Bono Radar <${SMTP_USER}>`,
    to: DIGEST_TO,
    subject: `Pro Bono Radar — ${items.length} developments this week`,
    html,
  });
  await pool.query(
    `INSERT INTO digests (period_start, period_end, item_ids) VALUES ($1, $2, $3)`,
    [periodStart.toISOString(), periodEnd.toISOString(), items.map((i) => i.id)],
  );
  console.log(`digest sent: ${items.length} items to ${DIGEST_TO}`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1); // loud failure -> journald via systemd
});
```

- [ ] **Step 5: Dry-run against local DB**

Run: `cd worker && DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npx tsx src/digest.ts --dry-run | head -5`
Expected: HTML starting `<div style="font-family:Georgia…`, no send, exit 0.

- [ ] **Step 6: Commit**

```bash
git add worker/
git commit -m "feat: weekly digest renderer and gmail smtp mailer"
```

---

### Task 6: RUNBOOK.md and ingest.sh (the agent routine)

**Files:**
- Create: `RUNBOOK.md`
- Create: `ops/ingest.sh`

**Interfaces:**
- Consumes: CLIs from Tasks 3–4, exactly as specified there.
- Produces: `ops/ingest.sh` — the single entrypoint the systemd ingest timer runs (Task 9).

- [ ] **Step 1: Write `RUNBOOK.md`**

````markdown
# Pro Bono Radar — Daily Ingest Runbook

You are the enrichment agent for Pro Bono Radar. Deterministic fetching has
already run. Your job is judgement: classify, summarise, and flag each new
item. Work only through the commands below — do not modify the database any
other way, do not edit files.

## Context

The reader of your blurbs is a Technology & Innovation lawyer at Gilbert +
Tobin who briefs partners and the pro bono team. Blurbs must be pasteable
into an email to a partner: plain, factual, two sentences, no hype.

Streams (exact strings): `news`, `law_reform`, `funding`, `tech_justice`.

An item is an **opportunity** when G+T's pro bono or T+I practice could act
on it: a CLC needing tech/legal capability, an open consultation where a
submission is feasible, a grant a client could pursue, a partnership call.
Be selective — a plain news story is not an opportunity.

## Procedure

1. List items awaiting enrichment:
   `docker compose --profile worker run --rm worker src/list-unenriched.ts`
2. For each item in the JSON output:
   a. If the excerpt is missing or thin, read the article at its `url`
      (WebFetch). If the page is unreachable, enrich from title + source
      alone and note the uncertainty in the blurb ("Reportedly…").
   b. Build this JSON payload:
      - `stream`: one of the four exact strings (use `stream_hint` as a
        prior, override when the content clearly belongs elsewhere)
      - `blurb`: two sentences, partner-pasteable
      - `opportunity`: boolean; `opportunity_reason`: one line, or null
      - `entities`: `{"organisations": [...], "deadlines":
        [{"date": "YYYY-MM-DD", "label": "..."}], "amounts": ["$1.2m"]}`
        (empty arrays when none; dates must be real dates from the text)
      - `excerpt`: ≤700 chars of the article's own opening text, or null
        to keep the existing excerpt
   c. Save it (payload on stdin):
      `echo '<json>' | docker compose --profile worker run --rm -T worker src/save-enrichment.ts <id>`
      If it exits 2, read the validation error, fix the payload, retry once.
3. Re-run the list command. Items you could not enrich after one retry stay
   unclassified — that is acceptable and visible by design. Never delete or
   invent items.
4. Finish by printing a one-line summary: items enriched, items skipped,
   opportunities flagged.
````

- [ ] **Step 2: Write `ops/ingest.sh`**

```bash
#!/usr/bin/env bash
# Daily ingest: deterministic fetch, then Claude Code enrichment run.
# Invoked by probono-ingest.service (systemd user timer) on Argus.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[ingest] fetch starting $(date -Is)"
docker compose --profile worker run --rm worker src/fetch-all.ts

echo "[ingest] enrichment agent starting $(date -Is)"
/home/l0cka/.local/bin/claude -p "$(cat RUNBOOK.md)" \
  --allowedTools "Bash(docker compose --profile worker run --rm*) WebFetch" \
  --max-turns 80 \
  --output-format text

echo "[ingest] done $(date -Is)"
```

- [ ] **Step 3: Make it executable and rehearse the deterministic half locally**

Run:
```bash
chmod +x ops/ingest.sh
cd worker && DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npx tsx src/fetch-all.ts | head -20
DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npx tsx src/list-unenriched.ts | head -20
```
Expected: fetch-all JSON shows the 3 RSS sources `ok` (firecrawl sources `failed` locally — no Firecrawl on the Mac; that failure path is the design working); list-unenriched shows real items. The full agent loop is smoke-tested on Argus in Task 9.

- [ ] **Step 4: Commit**

```bash
git add RUNBOOK.md ops/ingest.sh
git commit -m "feat: agent runbook and ingest entrypoint"
```

---

### Task 7: Dashboard scaffold and feed page

**Files:**
- Create: `dashboard/package.json`, `dashboard/tsconfig.json`, `dashboard/next.config.ts`, `dashboard/Dockerfile`
- Create: `dashboard/lib/db.ts`
- Create: `dashboard/app/layout.tsx`, `dashboard/app/globals.css`
- Create: `dashboard/app/page.tsx`

**Interfaces:**
- Consumes: the `items`/`sources` tables (Task 1).
- Produces: `GET /` — feed with query params `stream` (one of the four enum strings), `q` (full-text search), `opp` (`1` = opportunities only). Task 8 adds `/health` to the same app shell.

- [ ] **Step 1: Write `dashboard/package.json`**

```json
{
  "name": "probono-radar-dashboard",
  "private": true,
  "scripts": {
    "dev": "next dev -p 8850",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.1.0",
    "pg": "^8.12.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/pg": "^8.11.6",
    "@types/react": "^19.0.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Write `dashboard/tsconfig.json`, `dashboard/next.config.ts`, `dashboard/Dockerfile`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

`Dockerfile`:
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write `dashboard/lib/db.ts`**

```typescript
import pg from 'pg';

const globalForPg = globalThis as unknown as { pgPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPg.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPg.pgPool = new pg.Pool({ connectionString: url, max: 5 });
  }
  return globalForPg.pgPool;
}
```

- [ ] **Step 4: Write `dashboard/app/layout.tsx` and `dashboard/app/globals.css`**

`layout.tsx`:
```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'Pro Bono Radar' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">📡 Pro Bono Radar</Link>
          <nav>
            <Link href="/">Feed</Link>
            <Link href="/health">Health</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

`globals.css`:
```css
:root {
  --bg: #fbfaf7;
  --ink: #1f2430;
  --muted: #6b7280;
  --accent: #145a52;
  --card: #ffffff;
  --line: #e4e1d8;
  --flag: #9a3412;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14161c; --ink: #e8e6df; --muted: #9aa0ac; --accent: #4fb3a5; --card: #1c1f27; --line: #2a2e38; --flag: #f0a06c; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 Georgia, 'Times New Roman', serif; }
.site-header { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 22px; border-bottom: 1px solid var(--line); }
.site-header .brand { font-weight: 700; text-decoration: none; color: var(--ink); }
.site-header nav { display: flex; gap: 14px; }
.site-header a, main a { color: var(--accent); }
main { max-width: 780px; margin: 0 auto; padding: 18px 22px 60px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 20px; font-family: system-ui, sans-serif; font-size: 13px; }
.filters a { text-decoration: none; padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); }
.filters a.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.filters form { display: flex; gap: 6px; }
.filters input { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; background: var(--card); color: var(--ink); }
.item { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; margin-bottom: 12px; }
.item h3 { margin: 0 0 4px; font-size: 17px; }
.item .meta { color: var(--muted); font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 0.02em; }
.item .flag { color: var(--flag); font-family: system-ui, sans-serif; font-size: 12px; margin-top: 6px; }
.stream-pill { font-family: system-ui, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; font-size: 14px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.status-ok { color: var(--accent); }
.status-failed { color: var(--flag); font-weight: 600; }
```

- [ ] **Step 5: Write `dashboard/app/page.tsx`**

```tsx
import Link from 'next/link';
import { getPool } from '../lib/db';

export const dynamic = 'force-dynamic';

const STREAMS: Record<string, string> = {
  news: 'News', law_reform: 'Law reform', funding: 'Funding', tech_justice: 'Tech & justice',
};

type Search = { stream?: string; q?: string; opp?: string };

export default async function Feed({ searchParams }: { searchParams: Promise<Search> }) {
  const { stream, q, opp } = await searchParams;
  const cond: string[] = [];
  const args: unknown[] = [];
  if (stream && stream in STREAMS) { args.push(stream); cond.push(`i.stream = $${args.length}`); }
  if (opp === '1') cond.push(`i.opportunity`);
  if (q) { args.push(q); cond.push(`i.search @@ websearch_to_tsquery('english', $${args.length})`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await getPool().query(
    `SELECT i.id, i.title, i.url, i.blurb, i.excerpt, i.stream, i.opportunity, i.opportunity_reason,
            i.published_at, i.created_at, s.name AS source_name
     FROM items i JOIN sources s ON s.id = i.source_id
     ${where} ORDER BY coalesce(i.published_at, i.created_at) DESC LIMIT 100`,
    args,
  );

  const linkFor = (params: Record<string, string | undefined>) => {
    const merged = { stream, q, opp, ...params };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
    return qs ? `/?${qs}` : '/';
  };

  return (
    <>
      <div className="filters">
        <Link href={linkFor({ stream: undefined })} className={!stream ? 'active' : ''}>All</Link>
        {Object.entries(STREAMS).map(([key, label]) => (
          <Link key={key} href={linkFor({ stream: key })} className={stream === key ? 'active' : ''}>{label}</Link>
        ))}
        <Link href={linkFor({ opp: opp === '1' ? undefined : '1' })} className={opp === '1' ? 'active' : ''}>⚑ Opportunities</Link>
        <form action="/" method="get">
          {stream ? <input type="hidden" name="stream" value={stream} /> : null}
          <input name="q" placeholder="Search…" defaultValue={q ?? ''} />
        </form>
      </div>
      {rows.length === 0 ? <p>No items yet. The next ingest run will populate the feed.</p> : null}
      {rows.map((i) => (
        <article className="item" key={i.id}>
          <span className="stream-pill">{i.stream ? STREAMS[i.stream] : 'unclassified'} · {i.source_name}</span>
          <h3><a href={i.url}>{i.title}</a></h3>
          {i.blurb ? <p>{i.blurb}</p> : i.excerpt ? <p>{i.excerpt}</p> : null}
          {i.opportunity ? <p className="flag">⚑ {i.opportunity_reason}</p> : null}
          <p className="meta">
            {new Date(i.published_at ?? i.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </article>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Run it and verify against the local DB**

Run:
```bash
cd dashboard && $NODEBIN/npm install
DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npm run dev &
sleep 8 && curl -s http://127.0.0.1:8850/ | grep -o 'Pro Bono Radar' | head -1
curl -s 'http://127.0.0.1:8850/?stream=funding' > /dev/null && echo 'stream filter ok'
kill %1
```
Expected: `Pro Bono Radar` and `stream filter ok`, no 500s in output.

- [ ] **Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat: dashboard feed with stream filter, search, opportunity flag"
```

---

### Task 8: Dashboard health page and deadlines

**Files:**
- Create: `dashboard/app/health/page.tsx`
- Modify: `dashboard/app/page.tsx` (add deadlines block above the feed)

**Interfaces:**
- Consumes: `ingest_runs`, `items.entities` (Tasks 1, 4), `getPool` (Task 7).
- Produces: `GET /health` — last run per source with status; deadlines block on `/`.

- [ ] **Step 1: Write `dashboard/app/health/page.tsx`**

```tsx
import { getPool } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function Health() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT ON (s.id) s.name, s.fetch_method, r.status, r.items_found, r.items_new, r.error, r.created_at
     FROM sources s LEFT JOIN ingest_runs r ON r.source_id = s.id
     WHERE s.active
     ORDER BY s.id, r.created_at DESC NULLS LAST`,
  );
  return (
    <>
      <h2>Source health</h2>
      <table>
        <thead><tr><th>Source</th><th>Method</th><th>Last run</th><th>Status</th><th>Found</th><th>New</th><th>Error</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.fetch_method}</td>
              <td>{r.created_at ? new Date(r.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'never'}</td>
              <td className={r.status === 'failed' ? 'status-failed' : 'status-ok'}>{r.status ?? '—'}</td>
              <td>{r.items_found ?? '—'}</td>
              <td>{r.items_new ?? '—'}</td>
              <td>{r.error ? r.error.slice(0, 120) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 2: Add the deadlines block to `dashboard/app/page.tsx`**

Insert after the `.filters` div, before the empty-state paragraph:

```tsx
      {/* upcoming deadlines from enriched entities */}
      <Deadlines />
```

And add to the same file (below the default export):

```tsx
async function Deadlines() {
  const { rows } = await getPool().query(
    `SELECT i.title, d->>'date' AS date, d->>'label' AS label
     FROM items i, jsonb_array_elements(i.entities->'deadlines') d
     WHERE (d->>'date') >= to_char(now() AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD')
     ORDER BY d->>'date' ASC LIMIT 8`,
  );
  if (!rows.length) return null;
  return (
    <div className="item">
      <span className="stream-pill">Upcoming deadlines</span>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {rows.map((r, n) => (
          <li key={n}><strong>{r.date}</strong> — {r.label} ({r.title})</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify both pages render**

Run:
```bash
cd dashboard && DATABASE_URL=postgres://radar:dev-only-password@127.0.0.1:5433/radar $NODEBIN/npm run dev &
sleep 8
curl -s http://127.0.0.1:8850/health | grep -o 'Source health'
curl -s http://127.0.0.1:8850/ | grep -c 'item' | head -1
kill %1
```
Expected: `Source health`; feed still renders (count ≥ 0, no 500).

- [ ] **Step 4: Commit**

```bash
git add dashboard/
git commit -m "feat: source health page and upcoming deadlines block"
```

---

### Task 9: Systemd units, deploy script, Argus deployment and smoke test

**Files:**
- Create: `ops/probono-ingest.service`, `ops/probono-ingest.timer`
- Create: `ops/probono-digest.service`, `ops/probono-digest.timer`
- Create: `ops/deploy.sh`

**Interfaces:**
- Consumes: everything above.
- Produces: the running production system on Argus.

**Argus approval policy applies:** run this task with the user aware; every mutation on Argus below is scoped and verified read-only afterwards.

- [ ] **Step 1: Write the systemd user units**

`ops/probono-ingest.service`:
```ini
[Unit]
Description=Pro Bono Radar daily ingest (fetch + Claude enrichment)

[Service]
Type=oneshot
WorkingDirectory=/home/l0cka/services/probono-radar/src
ExecStart=/home/l0cka/services/probono-radar/src/ops/ingest.sh
TimeoutStartSec=3600
```

`ops/probono-ingest.timer`:
```ini
[Unit]
Description=Run Pro Bono Radar ingest daily at 06:00 Sydney

[Timer]
OnCalendar=*-*-* 06:00:00 Australia/Sydney
Persistent=true

[Install]
WantedBy=timers.target
```

`ops/probono-digest.service`:
```ini
[Unit]
Description=Pro Bono Radar weekly digest email

[Service]
Type=oneshot
WorkingDirectory=/home/l0cka/services/probono-radar/src
ExecStart=/usr/bin/docker compose --profile worker run --rm worker src/digest.ts
TimeoutStartSec=600
```

`ops/probono-digest.timer`:
```ini
[Unit]
Description=Send Pro Bono Radar digest Sundays 18:00 Sydney

[Timer]
OnCalendar=Sun *-*-* 18:00:00 Australia/Sydney
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 2: Write `ops/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy Pro Bono Radar to Argus. Idempotent.
set -euo pipefail
HOST=argus
DEST=/home/l0cka/services/probono-radar/src

echo "== sync =="
ssh "$HOST" "mkdir -p $DEST"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '.env' --exclude '.claude' \
  ./ "$HOST:$DEST/"

echo "== build & start db + dashboard =="
ssh "$HOST" "cd $DEST && docker compose build && docker compose up -d db dashboard"

echo "== apply schema + seed =="
ssh "$HOST" "cd $DEST && docker compose exec -T db psql -U radar -d radar < db/schema.sql && docker compose exec -T db psql -U radar -d radar < db/seed.sql"

echo "== install systemd user units =="
ssh "$HOST" "mkdir -p ~/.config/systemd/user && cp $DEST/ops/probono-*.service $DEST/ops/probono-*.timer ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now probono-ingest.timer probono-digest.timer"

echo "== verify =="
ssh "$HOST" "cd $DEST && docker compose ps && systemctl --user list-timers 'probono-*' --no-pager"
```

- [ ] **Step 3: Pre-deploy checks on Argus (read-only)**

Run:
```bash
ssh argus 'free -h | head -2; docker ps --format "{{.Names}}" | head; /home/l0cka/.local/bin/claude --version; ss -ltn | grep -E "5433|8850|3002" || echo "ports free / firecrawl port to verify"'
ssh argus 'curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3002/v1/scrape -H "content-type: application/json" -d "{\"url\":\"https://example.org\"}" || true'
```
Expected: memory available, ports 5433/8850 free, `claude` prints a version. If the Firecrawl probe does not return 200/401/402, find its real port: `ssh argus 'docker ps --format "{{.Names}} {{.Ports}}" | grep -i firecrawl'` and set `FIRECRAWL_URL` accordingly in `.env` (next step).

- [ ] **Step 4: Create `.env` on Argus (never synced)**

Run: `ssh argus 'cat > /home/l0cka/services/probono-radar/src/.env' <<'EOF'` with real values for `POSTGRES_PASSWORD` (generate: `openssl rand -hex 16`), `FIRECRAWL_URL` (from Step 3), `SMTP_USER`, `SMTP_PASS` (Gmail app password — **user must create this at https://myaccount.google.com/apppasswords and supply it**), `DIGEST_TO`, `DASHBOARD_URL=http://100.87.255.67:8850`.
Note: `mkdir -p` for DEST happens in deploy.sh; run `ssh argus 'mkdir -p /home/l0cka/services/probono-radar/src'` first if `.env` is created before the first deploy.

- [ ] **Step 5: Deploy**

Run: `chmod +x ops/deploy.sh && ops/deploy.sh`
Expected: compose ps shows `db` (healthy) and `dashboard` (running); both timers listed with next-run times in Sydney mornings/Sunday evening.

- [ ] **Step 6: Smoke test the full loop on Argus**

Run:
```bash
ssh argus 'cd /home/l0cka/services/probono-radar/src && docker compose --profile worker run --rm worker src/fetch-all.ts | tail -30'
ssh argus 'cd /home/l0cka/services/probono-radar/src && ./ops/ingest.sh 2>&1 | tail -15'
ssh argus 'cd /home/l0cka/services/probono-radar/src && docker compose exec -T db psql -U radar -d radar -c "SELECT count(*) FILTER (WHERE enriched_at IS NOT NULL) AS enriched, count(*) AS total FROM items;"'
ssh argus 'curl -s http://127.0.0.1:8850/ | grep -o "Pro Bono Radar" | head -1'
ssh argus 'cd /home/l0cka/services/probono-radar/src && docker compose --profile worker run --rm worker src/digest.ts --dry-run | head -3'
```
Expected: fetch-all reports per-source ok/failed; ingest.sh completes with the agent's one-line summary; enriched count > 0; dashboard serves; digest dry-run prints HTML. Check the dashboard from the Mac over Tailscale: `curl -s http://100.87.255.67:8850/ | grep -o 'Pro Bono Radar'`.

- [ ] **Step 7: First real digest (optional, with user)**

Run: `ssh argus 'cd /home/l0cka/services/probono-radar/src && docker compose --profile worker run --rm worker src/digest.ts'`
Expected: `digest sent: N items to …` and the email arrives. Skip if the user prefers to wait for Sunday.

- [ ] **Step 8: Commit and finish**

```bash
git add ops/
git commit -m "feat: systemd timers and argus deploy script"
```

Then merge per the finishing-a-development-branch skill (user decision).

---

## Self-Review Notes

- Spec coverage: four streams (schema check + runbook), agent routine (Task 6), helper scripts as agent hands (Tasks 3–4), digest with opportunities-first/deadlines/failure footer (Task 5), dashboard feed + search + deadlines + health (Tasks 7–8), Tailscale-only binding and Argus conventions (Tasks 1, 9), no API key (ingest.sh uses `claude` CLI), excerpts ≤700 enforced in schema and zod, retries: unenriched items re-listed next run (list-unenriched has no time cutoff).
- Firecrawl port (3002) and seed URLs are best-effort and explicitly verified in Task 9 Step 3 / smoke test; failures surface in `ingest_runs` by design.
- Type consistency: `RawItem`, `Enrichment`, CLI names, and env vars are used with identical names across tasks.
