# Documentation

This directory holds the project-facing documentation that should stay in sync with the codebase.

## Available Docs

- [Scraper operations guide](./scraper.md) — setup, local runs, automation, data files, and troubleshooting for the policy scraper.
- [Supabase RLS setup](./supabase-rls.md) — row-level security model, required environment variables, and migration instructions.

## Canonical Sources

- Root overview and local setup live in [`README.md`](../README.md).
- Agent and repo workflow guidance live in [`AGENTS.md`](../AGENTS.md).
- Script-specific entrypoints are summarised in [`scripts/README.md`](../scripts/README.md).

## Cleanup Rule

Prefer extending the existing docs above instead of adding more root-level `.md` files for the same topic. If a document is only relevant to one subsystem, keep it under `docs/`.
