# Hosting

The site is self-hosted by the maintainer behind a Cloudflare tunnel and
pulls this repository on a timer: data-only commits are picked up by ISR
within the hour, and code changes trigger a rebuild. The operational
runbook (server topology, units, cutover and rollback procedure) is kept
privately by the maintainer.
