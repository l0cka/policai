# Collector hosting

Collection runs on the maintainer's server on a daily schedule, in a
checkout separate from the one that serves the site, and pushes its data
commits to this repository. Retrieval and classification behaviour is
documented in [collector.md](./collector.md); installation, retained evidence,
storage admission and recovery are described in the
[wrapper runbook](../ops/collector/README.md).

The default review gate still waits for every open `automation/collection-*`
PR. `POLICAI_COLLECT_SUPERSEDE_STATE_ONLY=1` is a **policy proposal**, disabled
by default (`0`), with maintainer approval to enable (host environment change).
Only locally proven, unreviewed draft collector PRs changing `data/watch-state.json`
and/or `public/data/meta.json`, with an unchanged register and a receipt base on
main, can be superseded by a new run from freshly fetched main. Ready/reviewed
or editorial/feed PRs still block. Author strings are not independent provenance.

After output/structural validation, the wrapper pushes the replacement branch,
creates its draft PR and verifies read-back before commenting on and closing old
state-only PRs. Their branches, run trees and evidence remain intact; the receipt
and replacement name the old URLs. No-changes runs, including failures without
output, leave old PRs open; `superseded_prs` stays `planned` as an unused plan,
not pending closure work. A failed closure returns nonzero and retains the
verified replacement alongside any old PRs not yet closed. The `superseding`
receipt requires `--retry-publication` or manual reconciliation, not recollection.
Retry never lowers an already `published` phase, even if rechecking fails.
A concurrent merge, changed head or review, or a reopened PR whose closure was
recorded, requires manual reconciliation.
With the toggle on and no merges, changed output can cause daily PR churn while
main's watch state and freshness remain unchanged.
No automatic merge or deletion occurs. Installing this source and changing
the scheduled environment are separate approved host operations; a source
PR does neither. The existing private host runbook covers host-specific access.
