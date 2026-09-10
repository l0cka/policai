# Pro Bono Radar — child application rules

These rules apply to `apps/probono/**`. Root engineering and documentation
conventions still apply, but root Policai data/runtime assumptions do not.

## Independent boundaries

- Canonical source is `apps/probono` in the Policai repository. Policai stays at
  the repository root; the imported Pro Bono history must be preserved.
- `dashboard/` is a separate Next.js package and `worker/` a separate worker
  package, each with its own manifest and lockfile. Install, typecheck, test and
  build in the relevant package; do not merge their dependencies into Policai.
  See README for commands. Root checks alone do not verify the child.
- Pro Bono is Postgres-backed, not Policai's Git-backed JSON/ISR application.
  `db/` contains versioned schema, seeds and migrations only. Live database state,
  volumes and backups remain external to Git and application release trees.
- Secrets, production environment files, database URLs and SMTP credentials stay
  outside Git. Do not copy them from existing checkouts or expose them in logs.
  Use an isolated test database; tests must not mutate production data.

## Release and operational safety

- Pro Bono has a separate release, rollback, runtime and verification lane from
  Policai even though both share source history. A Policai deployment must not
  implicitly deploy Pro Bono or change its database, timers or email delivery.
- The new child deployment location
  `/var/lib/probono-radar/app/apps/probono` is **planned, not active until cutover**.
  Importing source is not a cutover. Existing runtime files under
  `/home/l0cka/Work/Argus/services/probono-radar/src` remain untouched; verify
  actual systemd working directories and container ownership before operations.
- Do not use the old `ops/deploy.sh` rsync deployment (`rsync --delete`). Legacy
  runbooks and unit paths are historical until an approved release procedure
  replaces them. Never sync a dirty checkout over another checkout.
- Preserve masks on `probono-digest.service` and `probono-digest.timer`. Never
  unmask, enable or send a digest without explicit approval and verified SMTP
  configuration. An included timer schedule is not permission to send email.
- Database migrations, live writes, deployment, timer changes and destructive
  cleanup need separate approval. Preserve external Postgres state, secrets and
  backups through cutover and rollback. Machine enrichment is not editorial
  approval.

## Change and verification discipline

- Read exact tracked diffs against the imported source before reconciling runtime
  changes. Apply reviewed hunks only, preserving upstream changes; no raw tree
  copies or changes to original dirty checkouts.
- Keep edits within the assigned ownership boundary. Coordinate package/CI and
  operational changes separately rather than editing their files incidentally.
- For UI changes check TSX/CSS syntax, heading hierarchy, description-list
  structure, labelled keyboard-scrollable regions and interactive SVG semantics.
  Verify child typechecks/builds where dependencies allow; report static checks
  separately from browser/accessibility testing and do not claim a live cutover.
- Before handoff inspect `git diff --check` and the exact changed-file list.
  Never commit, push or deploy unless specifically authorised.
