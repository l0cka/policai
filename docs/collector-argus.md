# Collector hosting

Collection runs once a day on the maintainer's server (Argus), in a worktree
separate from the checkout that serves the site. Retrieval and classification
are documented in [collector.md](./collector.md). Installation, host state,
evidence and failures are in the [wrapper runbook](../ops/collector/README.md).

Each run starts from a freshly fetched main and opens a ready collection PR
that auto-merges once the required checks pass. Merging deploys. The
collector keeps its own memory on Argus: its watch state, and an outbox of
findings main does not carry yet. So an unmerged, closed or stale PR loses
nothing, because the next run's PR replays it. Older open collection PRs are
closed when a newer one opens.

A failed run publishes nothing, keeps the last good host state and raises a
`collector-failure` issue. It never blocks the next run. Detections still
reach the site only as "needs review", and editorial approval stays per item
in the source review queue.

Installing the wrapper or the units is a reviewed host step. A source PR
changes neither.
