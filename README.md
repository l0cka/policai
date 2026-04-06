# Policai

Policai is an Australian AI policy tracker that aggregates and visualizes AI policy, regulation, and governance developments across federal and state jurisdictions. It monitors government guidance and Commonwealth agency activity.

**Current scope:**
- searchable Australian AI policy explorer
- Commonwealth agencies directory
- interactive view of the DTA's **Policy for the Responsible Use of AI in Government** (effective **15 December 2025**)

## Features

- **Policy Browser** - Search and browse tracked AI policies with filtering by jurisdiction, status, and category
- **Policy Framework** - Interactive visual map of the DTA AI Policy with requirements and timelines
- **Geographic View** - Explore policies by state and territory on an interactive map of Australia
- **Timeline** - Track the evolution of AI policy through time with key milestones and events
- **Relationship Graph** - Visualize connections between policies, agencies, and jurisdictions
- **Agency Directory** - Browse government agencies and their AI transparency statements
- **Admin Dashboard** - Manage content, review pending items, and monitor data sources
- **Automated Scraping** - AI-powered scraper that discovers and imports policies from government sources

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Visualizations**: D3.js, React Flow
- **Database**: Supabase
- **AI**: Anthropic Claude API (for web scraping analysis)

## Getting Started

### Prerequisites

- Node.js 20+
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/danielalkurdi/policai.git
   cd policai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with the required environment variables:
   ```bash
   # Supabase (optional - for admin features)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Anthropic API (required for scraper)
   ANTHROPIC_API_KEY=your_anthropic_api_key

   # Admin Authentication
   ADMIN_PASSWORD=your_admin_password
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Automated Scraper

Policai includes an AI-powered scraper that automatically discovers and imports AI policies from Australian government sources.

### Quick Start

```bash
npm run scrape
```

This will run all configured scrapers and:
- Analyze pages using Claude AI
- Auto-create high-confidence policies (relevance >= 0.8)
- Queue medium-confidence items for review (relevance 0.5-0.8)
- Skip low-relevance content

### Data Sources

The scraper monitors 8 Australian government sources:
- Digital Transformation Agency (DTA)
- Department of Industry, Science and Resources (DISER)
- CSIRO
- Australian Human Rights Commission (AHRC)
- Office of the Australian Information Commissioner (OAIC)
- NSW Government
- Victorian Government
- Australian Competition and Consumer Commission (ACCC)

For detailed scraper documentation, see:
- [QUICKSTART_SCRAPER.md](./QUICKSTART_SCRAPER.md) - Quick setup guide
- [SCRAPER_GUIDE.md](./SCRAPER_GUIDE.md) - Comprehensive documentation

## Project Structure

```
policai/
├── public/
│   └── data/           # JSON data files for policies, agencies, timeline
├── scripts/            # Scraper scripts
├── src/
│   ├── app/            # Next.js App Router pages
│   │   ├── admin/      # Admin dashboard
│   │   ├── agencies/   # Agency directory
│   │   ├── api/        # API routes
│   │   ├── framework/  # Policy framework visualization
│   │   ├── map/        # Geographic map view
│   │   ├── network/    # Relationship graph
│   │   ├── policies/   # Policy browser
│   │   └── timeline/   # Timeline view
│   ├── components/     # React components
│   │   ├── auth/       # Authentication components
│   │   ├── layout/     # Header, Footer
│   │   ├── ui/         # UI primitives (shadcn/ui)
│   │   └── visualizations/  # D3 and React Flow visualizations
│   └── lib/            # Utility functions
└── data/               # Scraper state files
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in the Vercel dashboard
4. Deploy

### Other Platforms

Build the production bundle:

```bash
npm run build
npm start
```

## License

MIT
