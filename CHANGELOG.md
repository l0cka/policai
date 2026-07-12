# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — git-native redesign (July 2026)

- **Git is now the database.** All reads come from versioned JSON in the repo; Supabase, auth, the admin dashboard, and the Vercel cron endpoints were removed (the production database no longer existed and the crons crashed on Vercel's read-only filesystem).
- **Automation moved to GitHub Actions.** A daily `collect.yml` workflow runs the new collector (`src/lib/pipeline/`) over ~27 verified official sources (departments, regulators, courts, every state and territory), classifies detections with AI when a key is configured (heuristics otherwise), validates the data, and commits the results — which redeploys the site.
- **New Developments feed** (`/developments` + home strip) showing detected policy activity with provenance and confidence labels; the curated register is never written by automation, and CI enforces that.
- **July 2026 data correctness refresh:** Voluntary AI Safety Standard marked superseded by the Guidance for AI Adoption; the mandatory-guardrails proposals paper marked closed per the National AI Plan; court practice-note dates corrected to verified instruments (NSW SC Gen 23, Vic SC GEN 25, Qld PD 5 of 2025, FCFCOA PD-AI, SA courts guidelines); WA/ACT coverage added; timeline backfilled to 48 sourced events; freshness stamps (`lastReviewedAt`, `meta.json`) surfaced in the UI.
- New statuses `superseded` and `closed` with lifecycle banners; `npm run validate:data` schema enforcement in CI; read-only public API; server-rendered pages with no first-paint fetch.

### Added

- Added failure alerting to the daily collector workflow: any failed run now opens (or comments on) a `collector-failure` issue, and the README carries a live workflow status badge.
- Added a dedicated `/courts` page tracking judicial AI practice notes and practice directions across Australian jurisdictions.
- Added `practice_note` as a new policy type so court instruments are a first-class category alongside legislation, guidelines, frameworks, and standards.
- Seeded five court practice notes: Federal Court GPN-AI, Federal Circuit & Family Court practice direction, NSW SC Gen 23, Vic Supreme Court guidelines, and Qld Supreme Court practice direction.
- Added Courts to the primary navigation bar.
- Integrated Vercel Web Analytics into the root Next.js application layout.
- Added a D3 force-directed network page for exploring policy relationships.
- Added dynamic `sitemap.xml` and `robots.txt` generation.
- Added robust deduplication across the research pipeline.
- Added automatic timeline generation from policy records and agency transparency discovery.
- Added a new blog post covering DTA's AI PoC to Scale guidance.
- Added a new blog post explaining how Policai updates itself automatically.
- Added `npm run check` as a single local quality gate for linting, tests, and production builds.
- Added shared domain value guards and display helpers for jurisdictions, policy types, statuses, timeline event types, and source-review wire values.

### Changed

- Simplified the map page back to a single Australia-focused view while the APAC tracker remains on hold.
- Updated the site disclaimer to emphasise that Policai is a work in progress and that all information should be independently verified.
- Sorted policies by date and surfaced the most recent research run in the interface.
- Continued open source preparation with repository cleanup and contribution-focused documentation.
- Updated project documentation to follow the HADS standard: honest, actionable, durable, and specific.
- Updated stale Anthropic/Claude/Codex documentation and admin settings copy to describe the current OpenRouter/OpenAI-compatible implementation.
- Routed admin scraper pending-review writes through the unified source-review data service instead of direct legacy JSON writes.
- Hardened AI JSON response parsing for fenced, nested, and array JSON values.

### Fixed

- Fixed the daily collector's push to `main` being rejected by the branch-protection ruleset (every scheduled run since 10 July had collected data and then failed to land it); the workflow now pushes via a dedicated write deploy key that is a ruleset bypass actor, and the setup is recorded in the collector docs.
- Improved blog prose readability in dark mode.
- Removed unsafe domain casts in pipeline/API/UI paths by normalising untrusted type and jurisdiction strings.

### Removed

- Removed `CLAUDE.md` so agent guidance lives only in `AGENTS.md`.
- Removed a tracked generated `docs/superpowers/` network redesign artifact.
- Removed unused `@anthropic-ai/sdk` and `@xyflow/react` dependencies.
- Removed public application-shell admin navigation links except for admin-route actions.

### Security

- Added authentication to previously unprotected API endpoints.
- Addressed P1 security issues in the application and admin surface.

## [0.1.0] - 2026-04-12

### Added

- Initial public release of Policai as an Australian AI policy and governance tracker.
- Searchable policy browsing, jurisdiction views, agencies directory, timeline views, and interactive visualizations.
- Admin tooling for review, source management, pipeline operations, and scraper-driven content intake.
- AI-assisted policy discovery, verification, summarization, and implementation workflows.
- MDX blog support with listing and detail pages.
- Hybrid data model with JSON-backed content and optional Supabase integration.

### Changed

- Established the IBM Plex visual system, streamlined navigation, and broader UI normalization across the public site.
- Expanded automation around policy discovery, scraping, and data refresh workflows.

[Unreleased]: https://github.com/l0cka/policai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/l0cka/policai/releases/tag/v0.1.0
