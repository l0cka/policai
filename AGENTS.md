# AGENTS.md - Policai Codebase Guide

## Project Overview

Policai is an Australian AI policy tracker. It maintains a curated register of AI policy, regulation, governance and court guidance across federal and state/territory jurisdictions, plus an automated "developments" feed of newly detected policy activity.

**Git is the database.** All canonical data is JSON committed to this repository (`public/data/`, `data/`). The deployed site (Vercel) only reads that data — pages are statically rendered from it at build time. Automation runs in GitHub Actions, which commits new detections; the push triggers a redeploy. There is no runtime database, no auth, and no admin dashboard.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4 with CSS variables; shadcn/ui (New York) on Radix
- **Visualisations:** D3.js
- **Data:** JSON files in `public/data/` (canonical, versioned) and `data/` (collector state)
- **AI (optional):** Anthropic SDK (preferred) or OpenAI SDK against OpenRouter, selected in `src/lib/ai-client.ts`; without a key the collector uses keyword heuristics
- **Scraping:** Cheerio
- **Testing:** Vitest (+ Testing Library)
- **Automation:** GitHub Actions (`.github/workflows/collect.yml`)

## Commands

```bash
npm run dev            # dev server on http://localhost:3000
npm run build          # production build
npm run lint           # ESLint (flat config)
npm run test           # Vitest
npm run validate:data  # structural validation of the data files
npm run check          # lint + test + validate:data + build — run before handing off
npm run collect        # one collection pass (-- --dry-run to preview, -- --source=<id> for one source)
npm run mcp            # local MCP source-ingest server
```

## Project Structure

```text
src/
├── app/
│   ├── page.tsx                  # Policy register (server component → client PolicyBrowser)
│   ├── developments/page.tsx     # Automated developments feed
│   ├── courts/page.tsx           # Court AI guidance view
│   ├── agencies/page.tsx         # Agency directory
│   ├── map|network|framework|timeline/  # Visualisations
│   ├── blog/                     # MDX blog
│   ├── policies/[id]/            # Policy detail (server) + client tabs
│   └── api/                      # READ-ONLY public JSON API (policies, agencies,
│                                 #   timeline, network, status)
├── components/                   # UI, layout, visualisation components
├── lib/
│   ├── data-service.ts           # File-backed reads/writes over the repo JSON
│   ├── validate-data.ts          # Data schema enforcement (used by CI + collector)
│   ├── ai-client.ts              # Provider selection + runAnalysisPrompt()
│   ├── analysis.ts               # AI relevance/summary helpers
│   ├── scraper-filter.ts         # Keyword heuristics shared by the pipeline
│   ├── source-ingest.ts          # Curated publish path (used by the MCP server)
│   └── pipeline/                 # Collector: sources.ts, extract.ts, classify.ts, collect.ts
├── mcp/                          # Local MCP server for staging/publishing records
└── types/index.ts                # All shared domain types

public/data/                      # Canonical data (also served as open JSON)
data/                             # watch-state.json, source-reviews.json (collector state)
scripts/                          # collect.ts, validate-data.ts CLIs
docs/                             # collector.md + docs index
```

## Data Model & Flow

1. **Register** (`public/data/policies.json`): curated policy records. Changed only by reviewed commits (human or MCP-assisted). The collector never writes it; the workflow fails if it does.
2. **Developments** (`public/data/developments.json`): automated radar feed. Each entry has provenance (`sourceId`, `url`), a relevance score, and a `classification` label — `ai`, `heuristic` (capped confidence, shows as "Needs review"), or `curated`.
3. **Collector** (`src/lib/pipeline/collect.ts`): pure orchestrator — fetch sources → extract candidates → diff against `data/watch-state.json` → classify → return developments/review candidates/state/meta. The CLI (`scripts/collect.ts`) persists them.
4. **Review**: high-confidence detections are staged in `data/source-reviews.json`; publishing (via the MCP tools or manual edit) creates a register record.
5. **Freshness**: `public/data/meta.json` records `lastCollectedAt`, `lastReviewedAt`, and per-run errors; the UI surfaces it.

See [docs/collector.md](./docs/collector.md) for operations.

## Key Domain Types

Defined in `src/types/index.ts` — always import from `@/types`:

- **Jurisdiction:** `federal | nsw | vic | qld | wa | sa | tas | act | nt`
- **PolicyType:** `legislation | regulation | guideline | framework | standard | practice_note | policy | tool | funding_program`
- **PolicyStatus:** `proposed | active | amended | superseded | closed | repealed | trashed` (only `trashed` is hidden from public reads; `superseded` records carry `supersededBy`)
- **Policy** — register entity (with optional `supersededBy`, `lastReviewedAt`)
- **Development**, **CollectionMeta** — feed + collector metadata
- **TimelineEvent**, **Agency**, **SourceReview**, **McpAuditLog**

Use the display-name helpers (`getPolicyTypeName()`, `getPolicyStatusName()`, `getJurisdictionName()`) for untrusted strings, and status colours from `src/lib/design-tokens.ts`.

## Environment Variables

None are required to run the site. Optional (see `.env.example`):

```bash
ANTHROPIC_API_KEY=        # AI classification (preferred provider)
OPENROUTER_API_KEY=       # AI classification (fallback provider)
AI_MODEL=                 # model override for either provider
POLICAI_MCP_ADMIN_TOKEN=  # local MCP source-ingest writes
```

## Editing Data

- Change `public/data/*.json` directly (or via the MCP tools), then run `npm run validate:data`.
- Every policy needs a real, verified `sourceUrl` (https, `.gov.au` or allow-listed host) and accurate dates — if a day-level date can't be verified, say so in `content` rather than inventing precision.
- Mark replaced instruments `superseded` (+ `supersededBy`) and dead consultations `closed`; don't delete history.
- Stamp `lastReviewedAt` when you have verified a record against its source.

## Code Conventions

- PascalCase components; camelCase functions/variables; types centralised in `@/types`.
- Use `readJsonFile`/`writeJsonFile` from `@/lib/file-store`; `cleanHtmlContent`/`extractJsonFromResponse` from `@/lib/utils`.
- Public pages read via `src/lib/data-service.ts` server-side; keep interactive parts in client components fed by server props.
- API routes are read-only and export named HTTP methods with `NextResponse.json()`.
- Run `npm run check` before handing off or committing.

## Documentation Standard

Keep docs HADS-aligned:

- **Honest:** describe the code that exists now; call out legacy names instead of pretending they are current.
- **Actionable:** include exact commands, paths, environment variables, and verification steps.
- **Durable:** avoid vendor/model claims that drift quickly unless the code depends on them.
- **Specific:** prefer concrete project paths and behaviours over generic advice.
