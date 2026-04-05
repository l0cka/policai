# CLAUDE.md - Policai Codebase Guide

## Project Overview

Policai is an Australian AI Policy Tracker — a Next.js web application that aggregates, analyzes, and visualizes AI policy, regulation, and governance developments across Australian federal and state/territory jurisdictions. It uses Claude AI to automatically discover, analyze, and categorize government AI policies from official sources.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4 with CSS variables
- **UI Components:** shadcn/ui (New York style) built on Radix UI primitives
- **Icons:** Lucide React
- **Visualizations:** D3.js 7, React Flow 11
- **Database:** Supabase (PostgreSQL) + file-based JSON in `public/data/`
- **AI:** Anthropic Claude SDK (`claude-sonnet-4-20250514` model)
- **Scraping:** Cheerio for HTML parsing
- **Auth:** Supabase Auth + custom admin password

## Commands

```bash
npm run dev        # Start dev server on http://localhost:3000
npm run build      # Production build
npm run start      # Run production server
npm run lint       # Run ESLint (Next.js core-web-vitals + TypeScript rules)
npm run scrape     # Run scheduled scrapers (tsx scripts/run-scheduled-scrapers.ts)
```

## Project Structure

```
src/
├── app/                          # Next.js App Router pages and API routes
│   ├── layout.tsx                # Root layout (theme provider, header, footer)
│   ├── page.tsx                  # Home page
│   ├── admin/                    # Admin dashboard (login + management)
│   ├── agencies/page.tsx         # Government agency directory
│   ├── framework/page.tsx        # DTA AI Policy Framework visualization
│   ├── map/page.tsx              # Interactive Australia map view
│   ├── network/page.tsx          # Policy relationship graph
│   ├── policies/                 # Policy browser (list + detail + timeline)
│   │   ├── page.tsx              # Searchable/filterable policy list with timeline tab
│   │   └── [id]/
│   │       ├── page.tsx          # Policy detail page (server component)
│   │       └── policy-detail-tabs.tsx  # Tabbed detail view (Overview/Content/Related)
│   ├── timeline/page.tsx         # AI policy timeline (standalone, not in main nav)
│   └── api/                      # API route handlers
│       ├── admin/
│       │   ├── run-scraper/route.ts    # Main scraper endpoint
│       │   ├── pending/route.ts        # Pending content management
│       │   └── analyse-url/route.ts    # URL analysis
│       ├── claude/analyze/route.ts     # Claude AI analysis endpoint
│       └── policies/
│           ├── route.ts                # Policy CRUD (GET/POST)
│           └── [id]/route.ts           # Single policy (GET/PUT/DELETE)
├── components/
│   ├── ui/                       # shadcn/ui components (button, card, dialog, etc.)
│   ├── layout/                   # Header, Footer
│   ├── admin/                    # Admin dashboard tab sub-components
│   │   ├── OverviewTab.tsx       # Stats and recent activity
│   │   ├── ReviewTab.tsx         # AI-suggested content review
│   │   ├── PipelineTab.tsx       # AI research pipeline controls
│   │   ├── SourcesTab.tsx        # Data source management
│   │   ├── TrashTab.tsx          # Soft-deleted policy management
│   │   └── SettingsTab.tsx       # AI and database configuration
│   ├── visualizations/           # AustraliaMap, Timeline, PolicyFrameworkMap
│   ├── auth/ProtectedRoute.tsx   # Auth guard wrapper
│   └── home-search.tsx           # Homepage search component
├── contexts/AuthContext.tsx       # Authentication state context
├── hooks/use-toast.ts            # Toast notification hook
├── lib/
│   ├── claude.ts                 # Claude AI integration (analysis, summarization, extraction)
│   ├── supabase.ts               # Supabase client and query functions
│   ├── auth.ts                   # Auth utility functions
│   ├── file-store.ts             # Shared JSON file I/O (readJsonFile, writeJsonFile)
│   ├── utils.ts                  # Helpers (cn, cleanHtmlContent, extractJsonFromResponse)
│   └── agents/                   # AI pipeline agent modules
│       ├── research-agent.ts     # Web research and content discovery
│       ├── verifier-agent.ts     # Fact-checking and verification
│       ├── implementation-agent.ts # Policy entry generation
│       └── pipeline-storage.ts   # Pipeline run/finding/verification persistence
└── types/index.ts                # All TypeScript type definitions

public/data/                      # JSON data files (policies, agencies, timeline, etc.)
scripts/                          # Scraper automation scripts
```

## Architecture & Patterns

### Navigation Structure
The app uses a simplified 3-item navigation: **Policies**, **Map**, **Agencies**. Other views (Framework, Network, Timeline) still exist as pages but are not in the main nav. Timeline is embedded as a tab within the Policies page. The home page focuses on search and a recent policies feed.

### Page Patterns
- **Policies list** (`/policies`): Client component with Browse/Timeline tabs, collapsible filters behind a toggle button, compact card design
- **Policy detail** (`/policies/[id]`): Server component for data fetching + client `PolicyDetailTabs` component with Overview/Content/Related tabs
- **Home page**: Server component with search bar, stats, and recent policies feed

### Routing
Next.js App Router with file-based routing. Pages are in `src/app/[route]/page.tsx`, API routes in `src/app/api/[endpoint]/route.ts`. Dynamic routes use `[id]` folder convention.

### Server vs Client Components
- Pages default to Server Components for data fetching
- Interactive components use `'use client'` directive at the top of the file
- Policy detail page uses a server/client split: server component fetches data, passes it to a client `PolicyDetailTabs` component for tabs
- Visualizations (D3, React Flow) are client-side only

### Data Storage
Dual storage strategy:
1. **Supabase** — primary database when configured (optional, requires env vars)
2. **JSON files** in `public/data/` — fallback/default data source, read via `fetch('/data/*.json')`

Policy data flows: Scraper fetches government sources -> Claude AI analyzes content -> policies saved to JSON or Supabase.

### Import Aliases
The `@/*` alias maps to `./src/*` (configured in `tsconfig.json`). Use it for all imports:
```typescript
import { Button } from '@/components/ui/button'
import { Policy } from '@/types'
import { cn } from '@/lib/utils'
```

### Styling
- Tailwind CSS utility classes for all styling
- Use `cn()` from `@/lib/utils` to merge conditional Tailwind classes
- Theme colors defined as CSS variables in `globals.css`
- Light-only theme with IBM Plex color system
- shadcn/ui components follow New York style variant

### Adding UI Components
shadcn/ui components live in `src/components/ui/`. To add new ones:
```bash
npx shadcn@latest add <component-name>
```
Configuration is in `components.json`.

## Key Domain Types

Defined in `src/types/index.ts`:

- **Jurisdiction:** `'federal' | 'nsw' | 'vic' | 'qld' | 'wa' | 'sa' | 'tas' | 'act' | 'nt'`
- **PolicyType:** `'legislation' | 'regulation' | 'guideline' | 'framework' | 'standard'`
- **PolicyStatus:** `'proposed' | 'active' | 'amended' | 'repealed' | 'trashed'`
- **Policy** — core entity with id, title, description, jurisdiction, type, status, agencies, aiSummary, tags, etc.
- **Agency** — government agency with transparency statement fields
- **TimelineEvent** — dated events with type (policy_introduced, amended, repealed, announcement, milestone)
- **PipelineRun**, **ResearchFinding**, **VerificationResult** — AI pipeline types
- Display name mappings: `JURISDICTION_NAMES`, `POLICY_TYPE_NAMES`, `POLICY_STATUS_NAMES`, `PIPELINE_STAGE_NAMES`, `VERIFICATION_OUTCOME_NAMES`

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# Required for AI features and scraping
ANTHROPIC_API_KEY=sk-ant-...

# Optional — Supabase (database features)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional — Admin authentication
ADMIN_PASSWORD=...
```

The app works without Supabase by falling back to JSON files in `public/data/`.

## Linting

ESLint 9 with flat config (`eslint.config.mjs`):
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`
- No Prettier configured — rely on ESLint rules only
- Run `npm run lint` to check; fix issues before committing

## Testing

No test framework is currently configured. There are no unit or integration tests.

## Scraper System

The automated scraper monitors 8 Australian government sources for AI policy content:
- Fetches pages with Cheerio HTML parsing
- Sends content to Claude AI for relevance scoring (0-1 scale)
- Auto-creates policies scoring >= 0.8, queues 0.5-0.8 for review, skips < 0.5
- Rate limited: 2s between pages, 5s between sources
- State tracked in `data/scraper-state.json`
- Trigger via `npm run scrape` or the admin dashboard API

## Code Conventions

- PascalCase for React components and type/interface names
- camelCase for functions, variables, and file names (except components which use PascalCase filenames)
- All types centralized in `src/types/index.ts` — always import from `@/types`, never redefine locally
- Shared utilities in `@/lib/utils.ts` (`cleanHtmlContent`, `extractJsonFromResponse`) and `@/lib/file-store.ts` (`readJsonFile`, `writeJsonFile`) — use these instead of inline implementations
- API routes export named functions matching HTTP methods (`GET`, `POST`, `PUT`, `DELETE`)
- Error handling with try/catch and `NextResponse.json()` with appropriate status codes
- Toast notifications for user-facing feedback (`use-toast` hook)
