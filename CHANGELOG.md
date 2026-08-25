# Changelog

This file documents all notable project changes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-26

### Added

- Added a public Developments feed for detected Australian AI policy activity.
- Added a Courts page for court and tribunal AI practice instruments.
- Added an explainable policy relationship explorer and improved map and timeline views.
- Added a read-only public API with validated filters, CORS, caching, and rate limits.
- Added a separate six-tool public MCP server that uses the public API.
- Added structured provenance, verification states, source fingerprints, and editorial review records.
- Added automatic and manual source health monitoring across 65 watch sources.
- Added repository data validation, source audits, and one local `npm run check` gate.
- Added contribution, security, architecture, trust model, hosting, collector, API, and MCP documentation.

### Changed

- Rebuilt Policai around Git-versioned JSON as the canonical data store.
- Moved production hosting and daily collection to the self-hosted Argus server.
- Kept automatic detections separate from the curated policy register.
- Required explicit editorial approval before a detection can update the register.
- Made deterministic keyword classification the default and Claude classification optional.
- Expanded the canonical data to 76 policies and 85 timeline events. Public filters withhold unverified records.
- Expanded court and tribunal coverage across Australian jurisdictions.
- Redesigned the public interface for clearer navigation, mobile use, and policy status display.
- Changed public pages to use server-side filtered data reads.
- Added `superseded` and `closed` policy states with structured lifecycle dates.

### Fixed

- Corrected policy dates, lifecycle states, duplicate records, source links, and court instrument coverage.
- Hardened browser retrieval, Firecrawl fallback behavior, and client-rendered page handling.
- Fixed collector push races and made scheduled data commits compatible with branch protection.
- Fixed stale or withheld records so they cannot bypass public data filters.
- Fixed policy network relationships, timeline projections, responsive navigation, and visual consistency.

### Security

- Updated runtime dependencies to resolve all reported high-severity npm advisories.
- Closed a captured-document time-of-check to time-of-use race.
- Added strict source URL validation, redirect controls, document limits, and browser-capture checks.
- Separated the local editorial MCP from the public read-only MCP.
- Kept admin tokens out of public HTTP and MCP interfaces.
- Removed obsolete runtime authentication and write-capable HTTP administration routes.

### Removed

- Removed Supabase and the runtime database fallback.
- Removed the admin dashboard, legacy write APIs, and Vercel cron routes.
- Removed the legacy multi-agent pipeline and unused external AI SDK dependencies.
- Removed the retired GitHub Actions collection workflow from active production use.

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

[Unreleased]: https://github.com/l0cka/policai/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/l0cka/policai/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/l0cka/policai/releases/tag/v0.1.0
