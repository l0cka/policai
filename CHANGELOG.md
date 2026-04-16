# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

- Simplified the map page back to a single Australia-focused view while the APAC tracker remains on hold.
- Updated the site disclaimer to emphasise that Policai is a work in progress and that all information should be independently verified.
- Sorted policies by date and surfaced the most recent research run in the interface.
- Continued open source preparation with repository cleanup and contribution-focused documentation.

### Fixed

- Improved blog prose readability in dark mode.

### Removed

- Removed the admin login page and admin dashboard UI from the public application shell.
- Removed client-side admin authentication wrappers and navigation links tied to the deleted admin surface.

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
