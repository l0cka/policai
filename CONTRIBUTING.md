# Contributing to Policai

Thanks for your interest in contributing to Policai! This guide covers the basics for getting started.

## Getting Started

1. Fork the repository
2. Clone your fork and create a branch from `main`:
   ```bash
   git clone https://github.com/<your-username>/policai.git
   cd policai
   git checkout -b feat/your-feature
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the environment file and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```

## Development Workflow

### Before You Start

- Check existing [issues](https://github.com/l0cka/policai/issues) to avoid duplicate work
- For large changes, open an issue first to discuss the approach
- Look at `AGENTS.md` for codebase conventions and architecture details

### Making Changes

- Create a feature branch from `main` (`feat/`, `fix/`, `docs/` prefixes)
- Follow existing code conventions (see `AGENTS.md` for details)
- Keep changes focused — one feature or fix per PR
- Add tests for new functionality where practical

### Code Style

- TypeScript strict mode
- PascalCase for components and types, camelCase for functions and variables
- All types in `src/types/index.ts` — import from `@/types`
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- shadcn/ui components follow the New York style variant

### Running Checks

Before submitting a PR, make sure everything passes:

```bash
npm run lint        # ESLint
npm run test        # Vitest
npm run build       # Production build
```

## Pull Requests

1. Push your branch and open a PR against `main`
2. Fill in the PR template
3. Ensure CI checks pass (lint, test, build)
4. Keep the PR description clear — explain what and why

### PR Size

Smaller PRs are easier to review. If your change is large, consider splitting it into smaller PRs that can be reviewed independently.

## Reporting Issues

- Use the issue templates (bug report or feature request)
- Include steps to reproduce for bugs
- Check existing issues before creating a new one

## Data Sources

Policai tracks Australian government AI policy. If you know of a .gov.au source we're missing, open an issue with the URL and we'll add it to the discovery pipeline.

## Environment Variables

The app works without any external services by falling back to JSON files in `public/data/`. For full functionality:

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | For AI features | Powers scraping analysis and discovery |
| `NEXT_PUBLIC_SUPABASE_URL` | For database | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For database | Supabase anon key |
| `CRON_SECRET` | For cron jobs | Authenticates scheduled scraper runs |
| `ADMIN_PASSWORD` | For admin UI | Protects the admin dashboard |

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
