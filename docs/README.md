# Documentation

This directory holds the project-facing documentation that should stay in sync with the codebase.

## Available Docs

- [Collector operations guide](./collector.md) — how the daily collector works, running it locally, the GitHub Actions workflow, reviewing detections into the register, and adding sources.

## Canonical Sources

- Root overview and local setup live in [`README.md`](../README.md).
- Agent and repo workflow guidance live in [`AGENTS.md`](../AGENTS.md). Do not add parallel agent files such as `CLAUDE.md`; keep this guidance consolidated.
- Script-specific entrypoints are summarised in [`scripts/README.md`](../scripts/README.md).

## Documentation Standard

Keep docs HADS-aligned:

- **Honest:** describe the code that exists now; call out legacy names instead of pretending they are current.
- **Actionable:** include exact commands, paths, environment variables, and verification steps.
- **Durable:** avoid vendor/model claims that drift quickly unless the code depends on them.
- **Specific:** prefer concrete project paths and behaviours over generic advice.

## Cleanup Rule

Prefer extending the existing docs above instead of adding more root-level `.md` files for the same topic. If a document is only relevant to one subsystem, keep it under `docs/`.
