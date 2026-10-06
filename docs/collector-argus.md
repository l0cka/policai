# Collector hosting

Collection runs on the maintainer's server on a daily schedule, in a
checkout separate from the one that serves the site, and pushes its data
commits to this repository. Retrieval and classification behaviour is
documented in [collector.md](./collector.md); installation, retained evidence,
storage admission and recovery are described in the
[wrapper runbook](../ops/collector/README.md).

The default review gate still waits for every open `automation/collection-*`
PR. `POLICAI_COLLECT_SUPERSEDE_STATE_ONLY=1` is a **policy proposal**, disabled
by default (`0`), that requires Daniel's approval before enabling. With it,
only locally proven collector PRs changing `data/watch-state.json` and/or
`public/data/meta.json`, with an unchanged register, can be superseded by a new
run from freshly fetched main. Editorial/feed PRs still block.

After successful output/structural validation, the wrapper comments on and
closes the old state-only PRs, retains their branches, run trees and evidence,
and names them in the new receipt and any replacement draft PR. A concurrent
merge or changed head refuses publication and needs manual reconciliation.
No automatic merge or deletion occurs. Installing this source and changing
the scheduled environment are separate approved host operations; a source
PR does neither. The existing private host runbook covers host-specific access.
