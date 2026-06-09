# AGENTS.md - Policai Codebase Guide

## Project Overview

Policai is an Australian AI policy tracker built with Next.js. It aggregates, analyses, and visualises AI policy, regulation, governance, court guidance, and government AI-use developments across Australian federal and state/territory jurisdictions.

The app uses OpenRouter/OpenAI-compatible chat completions for policy discovery, content analysis, verification, and implementation-draft generation. Supabase is optional; local development works with JSON fallback files in `public/data/`.

## Tech Stack

- **Framework:** Next.js 16 App Router with React 19
- **Language:** TypeScript 5 in strict mode
- **Styling:** Tailwind CSS 4 with CSS variables
- **UI Components:** shadcn/ui New York style on Radix UI primitives
- **Icons:** Lucide React
- **Visualisations:** D3.js 7
- **Database:** Supabase PostgreSQL plus JSON-file fallback in `public/data/`
- **AI:** OpenRouter via the `openai` SDK (`OPENROUTER_API_KEY`, optional `AI_MODEL`)
- **Scraping:** Cheerio for HTML parsing
- **Auth:** Supabase Auth plus admin password/token checks for protected operations
- **MCP:** Local MCP source-ingest server in `src/mcp/server.ts`

## Commands

```bash
npm run dev        # Start dev server on http://localhost:3000
npm run build      # Production build
npm run start      # Run production server
npm run lint       # Run ESLint
npm run test       # Run Vitest tests
npm run check      # Run lint, tests, and production build
npm run scrape     # Run scheduled scrapers
npm run pipeline   # Run daily research/verifier pipeline
npm run mcp        # Run local MCP source-ingest server
```

## Project Structure

```text
src/
├── app/                         # App Router pages and API routes
│   ├── page.tsx                 # Policy browser home page
│   ├── admin/                   # Admin dashboard and login
│   ├── agencies/page.tsx        # Government agency directory
│   ├── blog/                    # MDX-backed blog
│   ├── courts/page.tsx          # Court AI guidance view
│   ├── framework/page.tsx       # DTA framework visualisation
│   ├── map/page.tsx             # Interactive Australia map
│   ├── network/page.tsx         # Policy relationship graph
│   ├── policies/[id]/           # Policy detail pages
│   ├── timeline/page.tsx        # Timeline visualisation
│   └── api/                     # API route handlers
├── components/                  # UI, layout, admin, network, and visualisation components
├── contexts/AuthContext.tsx     # Authentication state context
├── hooks/use-toast.ts           # Toast notification hook
├── lib/                         # Data services, AI clients, auth, file I/O, helpers, agents
├── mcp/server.ts                # Local MCP source-ingest server
├── test/                        # Test factories and setup
└── types/index.ts               # Shared domain types

public/data/                     # JSON fallback/sample data
scripts/                         # Local automation entrypoints
docs/                            # Operational documentation
content/blog/                    # MDX blog posts
```

## Architecture & Patterns

### Navigation Structure

The primary navigation contains **Policies**, **Map**, **Agencies**, and **Courts**. Secondary insight views live under the **Insights** dropdown: **Timeline**, **Network**, **Framework**, and **Blog**. Admin actions are only shown on admin routes.

### Page Patterns

- **Home / policy browser** (`/`): client component with search, filters, summary stats, and policy table.
- **Policy detail** (`/policies/[id]`): server component for data fetching plus client tabs for overview/content/related policies.
- **Admin dashboard** (`/admin`): protected client workflow for scraping, review, pipeline, sources, trash, and settings.
- **Visualisations:** D3/client-side rendering for map, timeline, framework, and network views.

### Routing

Next.js App Router uses file-based routes in `src/app/[route]/page.tsx` and API handlers in `src/app/api/[endpoint]/route.ts`. Dynamic routes use `[id]` folder names. The legacy-named `src/app/api/claude/analyze/route.ts` currently calls the OpenRouter-backed analysis helper; do not assume it uses Anthropic.

### Server vs Client Components

- Pages default to Server Components when they only fetch/render data.
- Interactive components use `'use client'`.
- Keep browser-only D3/visualisation logic in client components.
- API routes export named HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).

### Data Storage

Data access should go through `src/lib/data-service.ts` and shared file helpers in `src/lib/file-store.ts` where practical.

Storage strategy:
1. **Supabase** when configured.
2. **JSON files** in `public/data/` as the local/default fallback.

Server-side writes that need to bypass RLS use `SUPABASE_SERVICE_ROLE_KEY` through server-only helpers. Never expose the service role key to client code.

### AI Pipeline

Shared AI client configuration lives in `src/lib/ai-client.ts` and uses OpenRouter through the `openai` SDK. Pipeline modules live in `src/lib/agents/`:

- `discovery-agent.ts` and `agency-discovery-agent.ts` discover candidate sources.
- `research-agent.ts` fetches and extracts source content.
- `verifier-agent.ts` checks findings.
- `implementation-agent.ts` drafts policy/timeline records.
- `pipeline-storage.ts` persists run, finding, and verification state.

`src/lib/claude.ts` is a legacy filename for analysis/summarisation helpers. Treat the implementation, not the filename, as canonical.

### Import Aliases

The `@/*` alias maps to `./src/*`. Prefer it for source imports:

```typescript
import { Button } from '@/components/ui/button';
import type { Policy } from '@/types';
import { cn } from '@/lib/utils';
```

### Styling

- Use Tailwind utilities and CSS variables from `globals.css`.
- Use `cn()` from `@/lib/utils` for conditional classes.
- Prefer existing shadcn/ui components in `src/components/ui/`.
- Keep design tokens and status colours centralised in shared helpers such as `src/lib/design-tokens.ts`.

## Key Domain Types

Defined in `src/types/index.ts`:

- **Jurisdiction:** `federal | nsw | vic | qld | wa | sa | tas | act | nt`
- **PolicyType:** `legislation | regulation | guideline | framework | standard | practice_note | policy | tool | funding_program`
- **PolicyStatus:** `proposed | active | amended | repealed | trashed`
- **Policy:** core policy/court/guidance entity.
- **Agency:** government agency record and AI transparency metadata.
- **TimelineEvent:** dated event for timeline views.
- **PipelineRun**, **ResearchFinding**, **VerificationResult**, **SourceReview:** AI pipeline and human-review records.

Use display-name helpers and maps from `@/types`, including `getPolicyTypeName()` for untrusted or newly discovered policy type strings.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Important variables:

```bash
OPENROUTER_API_KEY=          # AI discovery, analysis, verification, implementation drafts
AI_MODEL=                    # Optional model override; defaults in src/lib/ai-client.ts
NEXT_PUBLIC_SUPABASE_URL=    # Optional Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # Server-only writes with RLS enabled
CRON_SECRET=                 # Cron endpoint authentication
ADMIN_PASSWORD=              # Admin dashboard password
POLICAI_MCP_ADMIN_TOKEN=     # Local MCP source-ingest writes
```

The app can run without Supabase by falling back to JSON files.

## Linting and Testing

ESLint 9 uses flat config in `eslint.config.mjs`. Vitest is configured for unit/API tests.

Run before handing off or committing:

```bash
npm run check
```

## Scraper System

The scraper monitors configured Australian government sources for AI policy content:

- Fetches pages with Cheerio.
- Sends extracted content to OpenRouter-backed analysis for relevance scoring.
- Auto-creates high-confidence policies, queues medium-confidence content for review, and skips low-confidence content.
- Rate limits between pages and sources.
- Tracks local scheduler state in `data/scraper-state.json`.
- Runs via `npm run scrape`, cron endpoints, or the admin dashboard.

## Code Conventions

- PascalCase for React components and type/interface names.
- camelCase for functions, variables, and non-component file names.
- Import shared domain types from `@/types`; do not redefine them locally.
- Use `readJsonFile`/`writeJsonFile` from `@/lib/file-store` instead of ad hoc JSON file I/O.
- Use `cleanHtmlContent` and `extractJsonFromResponse` from `@/lib/utils` instead of inline parsing variants.
- Handle API errors with `try/catch` and `NextResponse.json()` status codes.
- Use `use-toast` for user-facing notifications.

## Documentation Standard

Keep docs HADS-aligned:

- **Honest:** describe the code that exists now; call out legacy names instead of pretending they are current.
- **Actionable:** include exact commands, paths, environment variables, and verification steps.
- **Durable:** avoid vendor/model claims that drift quickly unless the code depends on them.
- **Specific:** prefer concrete project paths and behaviours over generic advice.
