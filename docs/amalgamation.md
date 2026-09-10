# Policai and Pro Bono amalgamation

The source import is complete; production cutover remains outstanding. Policai
stays at the repository root. Pro Bono Radar is under `apps/probono`, with
independent dashboard and worker packages, PostgreSQL data and release handling.

The integration PR is [#99](https://github.com/l0cka/policai/pull/99), from
`bob/amalgamation` into `main`. Do not merge while the legacy deployment helper
can automatically deploy `main`.

## Source and verification

- Pro Bono history was imported in `0f395d2`; application isolation and child CI
  were added in `3c8a170`.
- `6c0d9e3` added the host dispatcher candidate under `ops/host`. Its operational
  code remains uninstalled. The [installation procedure](../ops/host/INSTALL-REVIEW.txt)
  and [sandbox review](../ops/host/SANDBOX-REVIEW.md) retain the cutover gates.
- The original CI workflow used `job.services` in job-level `env`, where that
  context is unavailable, and indexed a service port with a number. The repaired
  workflow sets the database URL on the two database steps and uses the string
  key `'5432'`. Actionlint reproduces both original errors and accepts the fix.
- The Host dispatcher CI job checks the source manifest before running its
  offline tests and retains the verification report. Host fixtures no longer
  require the production `policai` and `l0cka` accounts.
- `ops/host/install.py` now provides a preview and a first-install file transaction
  for the 11 explicit helper/unit targets. It retains original files and supports
  rollback before dispatcher initialisation. Protected configuration, clean clones
  and runtime cutover retain their separate preparation and verification steps.

Run the application checks independently:

```bash
npm run check
env -u DATABASE_URL npm --prefix apps/probono/dashboard run typecheck
env -u DATABASE_URL npm --prefix apps/probono/dashboard run build
env -u DATABASE_URL npm --prefix apps/probono/worker run typecheck
env -u DATABASE_URL npm --prefix apps/probono/worker test
env -u DATABASE_URL npm --prefix apps/probono/worker run test:security
python3 -B ops/host/verify.py
git diff --check
```

The worker command above skips database integration tests. CI supplies a disposable
PostgreSQL service for those tests; never substitute production `DATABASE_URL`.
The host verifier regenerates `ops/host/MANIFEST.sha256`; review that diff before
publication. Check an existing bundle without refreshing its hashes with:

```bash
(cd ops/host && sha256sum --check MANIFEST.sha256)
```

## Observed on 11 September 2026

These observations are a baseline, not permission to skip fresh preflight:

- Local root checks passed: lint, typecheck, 501 tests, data validation and build.
  Data validation reported 0 errors and 79 editorial warnings.
- Both child typechecks and the dashboard build passed. Worker tests passed
  74 unit tests with 12 database integration tests skipped; both enrichment
  security tests passed. The expanded host and compatibility suite passed all
  55 tests, including installation interruption and rollback fixtures. Actionlint,
  Ruff and syntax verification of the four candidate systemd services passed.
- PR #99 had no successful remote checks at head `6c0d9e3`. Actions rejected the
  original workflow before starting any jobs. The CI repair needs publication
  and a successful run against the updated PR head.
- Argus is now `argus-omarchy`. Older skill references describing a separate
  Ubuntu server are historical; the `argus` SSH alias points to this machine.
- Policai runs from `/var/lib/policai/app`. Its pull timer is enabled and waiting;
  `/usr/local/libexec/policai-deploy` is still the legacy single-application helper.
- Pro Bono ingest and enrichment retain the working directory
  `/home/l0cka/Work/Argus/services/probono-radar/src`. The dashboard and database
  containers are running on their existing loopback ports. Digest service and
  timer remain masked and inactive.
- The topology check reported `OK=147 DRIFT=1 UNKNOWN=0`. The drift concerns
  unexpected UDP listeners, not a Policai or Pro Bono service failure. Ownership
  and disposition of those listeners remain to be resolved before a topology-OK
  cutover can be claimed.

## Remaining sequence

1. Publish the reviewed source fixes to PR #99 and obtain passing checks at that
   exact head, including the disposable database integration suite and host tests.
2. Complete review of the host implementation and the new file installer. Stage
   the exact reviewed commit into its protected source snapshot, and prepare the
   external config, clean release clones and stable lock files. Preserve effective
   units and original scheduler states alongside the installer's file rollback record.
3. Complete a fresh database backup and disposable restore drill, record current
   container/image/cluster identities, and retain the pre-cutover recovery dump
   outside routine backup rotation. Reconcile current runtime diffs before
   selecting release artifacts; preserve the original dirty Pro Bono checkout.
4. Obtain approval for the concrete installation and cutover. Freeze the existing
   deployment and worker triggers, then verify their jobs have finished. Keep the
   database running and digest masks intact.
5. Install the reviewed dispatcher and guarded worker entrypoints. Verify the
   final systemd namespace, read-only user-unit bind, public HTTPS Git fetch and
   Docker client/build behaviour. Initialise the measured baseline. Coordinate
   main publication while the old automatic helper cannot deploy it.
6. Build and activate both initial releases through the guarded dispatcher;
   verify health, database identity, public routing and rollback. Reconcile the
   host topology contract, resolve outstanding drift and restore the original
   schedulers only after verification.

Source publication, installation and production activation are separate steps.
The source changes do not authorise database migrations, tunnel changes, email
delivery or deletion of the original checkout. See the root [agent guide](../AGENTS.md),
the [child guide](../apps/probono/AGENTS.md) and the host installation procedure.
