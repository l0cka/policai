TWO-RUNTIME HOST DISPATCHER — INSTALLED, LIVE DEPLOY PATH

The dispatcher is installed and is the live deploy path for both runtimes.
/usr/local/libexec/policai-host holds a copy installed from this bundle through
install.py. That copy can lag main until the next reviewed install.

Entry point: cli.py
Safe local demonstration: ./cli.py --help
Installation preview: python3 -I install.py plan
Upgrade preview against the installed tree: python3 -I install.py upgrade plan
Tests: python3 -B verify.py
CI: the Host dispatcher job checks MANIFEST.sha256 before running verify.py.
Tests need Python >=3.11, Git and the Docker Compose plugin; Compose configuration
is parsed locally without a daemon. No production accounts or root access are needed.
verify.py regenerates MANIFEST.sha256; review its diff when changing this bundle.
Detailed window and rollback procedure: INSTALL-REVIEW.txt
No invocation from this user-owned bundle can pass the CLI installation guard.
Do not run this bundle as root. Review and install a fixed snapshot first.

WHAT EXISTS
  install.py: file transactions over the 14-entry install set (FILES: source name,
  destination, mode, owner), shared by first install and upgrade. First install
  (plan/apply/rollback) is one-shot: protected source-manifest checks, held-job
  preflight, original-file backups and repeatable pre-initialization rollback.
  upgrade (plan/apply/rollback) replaces only the entries whose bytes, mode or
  owner differ from the reviewed snapshot, under the same manifest and held-job
  gates plus a healthy-dispatcher gate, a config gate and a digest that binds
  apply to the installed tree the plan reviewed; see UPGRADE CONTRACT. Neither
  mode provisions release clones, environment, config, state directories or
  locks, reloads managers, starts jobs, or activates runtimes. Config stays
  operator-owned: the installer reads /etc/policai-deploy/config.json to gate
  apply and never writes it.
  units/probono-*.service: guarded worker entrypoints; existing timers remain separate.
  dispatcher.py: table-driven lane routing (ROUTES), stable flock exclusion,
  fsynced journals, retained-directory activation and rollback, persistent failure
  gate, reviewed recovery with preserved prior failure records.
  host.py: bounded subprocess/identity adapters; fixed Git, systemd, Compose,
  database identity and HTTP health checks; worker/backup guard.
  cli.py: initialize / deploy / rollback / status / worker / compose.
  bin/docker: allowlisted nested Compose adapter for ingest, enrichment and
  deadline verification.
  backup.sh: canonical-path variant of the existing backup helper; same dump,
  gzip/content/size checks and 14-day/newest-five retention semantics.
  backup-mirror.sh: additive copy of the radar-*.sql.gz dumps and their
  globals-*.sql.gz role dumps (needed to restore onto a fresh cluster) onto a second
  physical disk, so one device failure cannot take the database and every backup
  together. It is not off-site. It refuses to run unless the mirror mount is
  mounted (an unmounted mount point would put the copy back on the root disk),
  never overwrites a mirrored file (--ignore-existing, so a corrupt source cannot
  replace a good copy), never deletes (pruning the mirror is an operator act),
  gzip-tests every mirrored file and rewrites SHA256SUMS.txt. The worker lock
  serialises it with backup.sh. Its three paths come from the root config key
  backup_mirror (source, mount, destination); the destination must sit beneath
  the mount, which must not be / or contain the source.
  policai-deploy: new delegate for /usr/local/libexec/policai-deploy.
  compatibility/policai-deploy.sh: tested home-bin delegate to system service.

RUNTIME CONTRACT
  Policai: /var/lib/policai/app, commands as policai, port 127.0.0.1:8794.
  Pro Bono: /var/lib/probono-radar/app/apps/probono, commands as l0cka,
  dashboard port 127.0.0.1:8850. No new Docker principal.
  Existing Postgres container, cluster, image, volume and port 5433 stay fixed.
  Compose project probono-radar; external volume probono-radar_pgdata;
  external network probono-radar_default. Dashboard activation uses up with
  --no-deps --no-build --pull never. No DB up/down, migration or seed command.
  Worker run does NOT use --no-build: the installed Compose run CLI does not
  support that flag. It checks the selected existing image, uses --pull never
  and --no-deps, and never passes --build. External pruning is prohibited.
  Environment file: /etc/probono-radar/runtime.env, outside source/build paths.
  No tunnel, DNS, Access, email enablement, service restart or installation was
  performed while developing this artifact.

INSTALLATION CONTRACT — ONLY IN THE SEPARATELY APPROVED WINDOW
  1. Complete INSTALL-REVIEW.txt preflight, backup/restore drill and timer freeze.
     Verify no live legacy job can bypass the new exclusion. Preserve originals.
  2. Install cli.py, host.py, dispatcher.py, backup.sh, backup-mirror.sh and bin/docker below
     /usr/local/libexec/policai-host, root-owned. Directories 0755, modules 0644,
     entrypoints 0755. Replace /usr/local/libexec/policai-deploy with the new
     delegate only after the old oneshot is idle. Preserve rollback copies.
     The executable file transaction and its protected snapshot staging procedure
     are specified in INSTALL-REVIEW.txt. Complete directory/lock provisioning first.
  3. Provision root-owned 0755 /var/lib/policai-deploy-state and, beneath it,
     artifacts/policai/candidates, artifacts/policai/retained,
     artifacts/probono/candidates, artifacts/probono/retained.
     Provision deploy.lock and worker.lock as root-owned regular 0644 files ONCE.
     Never replace their inodes. Artifact and active directories must share a
     filesystem. The application identities must NOT own artifact ancestors.
  4. Provision the child full Git clone, the external environment and reviewed
     system/user service entrypoints. Config and baseline live at
     /etc/policai-deploy/{config.json,baseline.json}, root-owned 0644 or tighter,
     under root-owned non-writable ancestors. Examples intentionally contain
     INVALID placeholders; measure real identities. No secrets in these JSONs.
     runtime.env is root-owned 0640, readable by l0cka's existing principal only.
  5. Complete the exact CLI sequence below, public-route checks, topology
     contract update/fixture/regeneration/live check and scheduler restoration.

UPGRADE CONTRACT — ONLY IN A HOST WINDOW DANIEL APPROVES THROUGH ARGUS DEVOPS
  The installed copy under /usr/local/libexec/policai-host lags main until a
  reviewed upgrade. Installing one is a root operation on the production host:
  it needs a host window approved by Daniel through Argus DevOps, and a PR merge
  is not that approval.

  Preview, from any checkout as l0cka (reads the installed tree, writes nothing):
    python3 -I ops/host/install.py upgrade plan
  It prints one line per install-set entry (changed, added or unchanged, with the
  installed and reviewed sha256/mode/owner), a unified diff for every changed or
  added file, units included, the journal location and an expect-installed
  digest: sha256 over the sorted (destination, installed sha256/mode/uid/gid or
  absent) set it read. Record that digest with the approval. Running plan as
  root is refused outside the protected snapshot.

  plan then evaluates the apply gates it can reach without root and prints one
  line per gate, so a plan whose evaluated gates all pass means apply passes
  the same gates:
    gates 2, 4, 5 and 6 are evaluated (pass, refused: <reason>, or not
      evaluated: <error> when a file could not be read). Gate 2 reports the
      checkout's MANIFEST.sha256 digest, which is the --manifest-sha256 value
      once that exact tree is staged. Gate 4 runs systemctl, docker ps and ps
      read-only, directly as l0cka (as root it drops to l0cka through runuser),
      so plan refuses user preflight under any other account.
    gates 1 and 3 are never evaluated by plan: it does not run from the snapshot
      and it never takes deploy.lock, because holding the lock would make a
      concurrent deploy or worker refuse. Gate 7 is the digest plan prints.
  plan exits 0 when every evaluated gate passes and 1 when one refuses; the file
  plan is printed either way. Gate 4 refuses until the triggers are held, so
  run plan once before the window for review and again after holding the
  triggers, immediately before apply.

  Stage the snapshot exactly as INSTALL-REVIEW.txt describes for first install:
  export the reviewed commit's ops/host tree, record its MANIFEST.sha256 digest in
  the approval record, and place it root-owned under
  /usr/local/libexec/policai-host-review. Move the previous snapshot aside first
  (never edit a snapshot in place; rollback of an upgrade runs from the snapshot
  that applied it). Then hold the triggers (INSTALL-REVIEW.txt step 2) and run:
    sudo /usr/bin/python3 -I /usr/local/libexec/policai-host-review/install.py \
      upgrade apply --manifest-sha256 "$MANIFEST_SHA256" \
      --expect-installed "$EXPECT_INSTALLED"

  --expect-installed is the digest the reviewed plan printed. It is required
  for a first apply (no journal.json for this manifest yet) and optional for a
  re-apply of an existing journal, which is bound by the journal's own before
  records instead. Whenever it is given, apply recomputes the digest from the
  live tree and refuses on a mismatch, so a file replaced between plan and
  apply never becomes the journalled rollback target. After a crash mid-apply
  the live tree is mixed, so rerun apply without the digest.

  apply runs only when every gate passes, in this order, before any file changes:
    1. install.py is the protected snapshot's copy and the caller is root;
    2. the snapshot's MANIFEST.sha256 digest equals --manifest-sha256 and every
       listed file matches (verify_manifest); the bytes apply later reads from
       the snapshot must hash to the same values or apply refuses;
    3. deploy.lock is held exclusively, so no deploy or worker is running;
    4. held(): policai-pull and every probono service and timer (ingest, enrich,
       backup, backup-mirror, verify-deadlines) inactive with no drop-ins, both
       digest units masked, no legacy worker container or process;
    5. dispatcher_ready(): no blocked.json, and active.json present as a JSON
       object with target and heads (the record the dispatcher writes after a
       completed activation) whose bootstrap_pending is absent or exactly
       false. The dispatcher omits the key when it is false and cli.py status
       reads it with a false default, so a missing key passes; true, any
       non-boolean value, or a record without target and heads (such as {})
       refuses. recovery.json and last-success.json are not read;
    6. config_ready(): /etc/policai-deploy/config.json is a readable JSON
       object whose backup_mirror block passes the same rules as host.py
       mirror_environment (source, mount and destination are normalised
       absolute paths; mount is not /, contains destination and does not
       contain source). A missing block is reported with the exact block to
       add; every other refusal names only the failing key, and no other
       config content is ever printed. Rollback does not need this gate;
    7. the live tree matches --expect-installed when given, and every entry,
       unchanged ones included, is at its before or after state.
  Only then does apply create the journal directory and save journal.json, so a
  refused apply or re-apply leaves no journal and no applying phase behind.

  Config step for the 2026-10-16 change set. The new host.py reads the root
  config key backup_mirror for cli.py worker backup-mirror, and the live config
  predates it. Add this block to /etc/policai-deploy/config.json (root 0644,
  paths from the ~/.local/bin/probono-backup-mirror.sh it replaces) before
  apply; plan prints it verbatim while it is missing:
    "backup_mirror": {
      "source": "/home/l0cka/Backups/probono-radar",
      "mount": "/mnt/argus-ssd",
      "destination": "/mnt/argus-ssd/home/l0cka/backups/probono-radar"
    }
  The block is inert for the installed code, which reads only the keys it
  knows, so it can be added any time before the window, and leaving it in
  place after a rollback breaks nothing. installed_hashes is different: the
  installed host.py preflight refuses an installed_hashes path it does not
  know, so the new entries (backup-mirror.sh and the backup-mirror unit) and
  the changed digests go in after apply and come out again on rollback, with
  the triggers held throughout. Workers never read installed_hashes, so the
  nightly mirror needs only the block, the new unit and a daemon-reload.
  Decision: the installer gates on the block and never writes config (the
  issue's option a). The alternative, apply adding the block through the file
  transaction, was rejected because config.json is operator-owned and outside
  the reviewed snapshot (its after bytes could not be bound to the manifest),
  re-serialising it would rewrite every other key in a file that holds host
  settings and the recovery authorisation, and it would not have made the
  window safe on its own, since installed_hashes still needs the operator.

  Journal: /var/lib/policai-deploy-state/upgrades/<manifest-sha256>/ (root 0700),
  separate from the first-install journal at .../installation. journal.json holds
  phase (applying, applied, rolling-back, rolled-back) and, per entry, source,
  destination, before (sha256, mode, uid, gid, or null when absent) and after.
  <index>.before holds the original bytes of every changed file. before is
  written once and never rewritten. The upgrades/ and <manifest-sha256>/
  directory entries are fsynced, as is the state directory itself, before the
  first replacement.

  Every file, journal.json included, is written as .install-<hex> in its own
  directory and renamed into place; the temporary is unlinked on any failure.
  Only a power loss between create and rename can leave one behind. It is
  harmless (systemd loads only unit-suffixed names and nothing executes it) and
  may be removed once no apply or rollback is running. A journal.json that
  fails to parse, or is oversized, is therefore a media fault, not a crash
  outcome: apply and rollback both refuse it and write nothing. To recover,
  move the journal directory aside (never delete it; the <index>.before files
  are the only copies of the original bytes), run upgrade plan to see which
  entries are at the installed or reviewed state, then either re-run apply
  with the approved expect-installed digest if every entry is still installed,
  or restore each changed entry by hand from its <index>.before file (index is
  the entry's position in plan output) and confirm with upgrade plan.

  State machine: each destination is at before, at after, or foreign. apply
  converges every entry to after; rollback converges every entry to before.
  Both validate all entries first, unchanged ones included, and refuse on a
  foreign file before writing anything, back up originals before the first
  replacement, write each file by atomic rename with fsync through an open
  directory descriptor, and skip an entry already at its target. A foreign
  file blocks both until the operator restores it; nothing is half-applied, so
  restoring that one file is the whole repair. A crash at any point followed
  by a rerun of apply, or a rollback, converges; a second rollback changes
  nothing. Unchanged entries are never written. Rollback requires gates 1 to 4
  but not 5 or 6, so it stays available when the new code blocked the
  dispatcher or the config is wrong. It
  is the file-level counterpart of, and never a substitute for, cli.py rollback
  (release artifacts and images). Re-applying the same snapshot after its
  rollback is allowed and reuses the journal.

  apply and rollback install files only. They never touch active.json,
  blocked.json, last-success.json, recovery.json, config.json, release clones,
  Docker, the database, runtime.env or timers, and they do not daemon-reload.
  After apply: inspect installed hashes and effective units, update
  installed_hashes in /etc/policai-deploy/config.json for every changed or
  added entrypoint (the 2026-10-16 change set adds backup-mirror.sh and the
  backup-mirror unit, which the new host.py preflight requires), reload the
  system and user managers, verify effective ExecStart values, then restore
  timers (INSTALL-REVIEW.txt step 4). Keep a copy of the previous config.json
  and restore it after a rollback. That change set also moves
  probono-backup-mirror.service from ~/.local/bin/probono-backup-mirror.sh
  onto cli.py worker backup-mirror; the old script is left in place and its
  removal is an operator act.

  Fixture: tests/fixtures/installed-2026-09-11 holds the installed tree as
  observed on 2026-10-16 (cli.py, host.py, dispatcher.py, backup.sh and the
  backup-mirror unit; absent.txt lists backup-mirror.sh as not installed),
  reconstructed by reverse-applying Argus DevOps's installed-vs-b17bb52 diff.
  Every other install-set entry matched b17bb52 byte for byte. test_upgrade.py
  drives plan, apply, crash and rerun, rollback and the gates against it.

SERVICE ROUTING (REVIEW EXISTING HARDENING; NOT BLIND DROP-INS)
  System policai-pull.service remains the compatibility entrypoint. It must
  execute the new delegate as root. Git/npm run as policai; child Git/Docker run
  as l0cka. The service needs permission for the two release parents, trusted
  state, systemd operations and identity transitions. Do not remove hardening
  wholesale. Keep ProtectHome=true. The draft system unit binds ONLY the user
  unit directory read-only to /run/policai-deploy-observation/user-units, not back
  beneath inaccessible /home. Verify the actual bind, hashes and digest symlinks
  inside the final sandbox. Both release origins must use the exact public URL
  https://github.com/l0cka/policai.git. No SSH key or credential grant is required.
  Git/Compose deployment clients use /var/lib/probono-radar as HOME; provision
  its .docker directory mode0700 owned by l0cka for Docker build-client state.
  Claude workers keep their existing /home/l0cka user context outside this unit.
  Keep the same timer cadence; do not enable an alternative scheduler.

  Each existing user service must invoke (as l0cka):
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker ingest
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker enrich
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker backup
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker backup-mirror
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker verify-deadlines
  Working directory: /var/lib/probono-radar/app/apps/probono.
  Preserve original schedules, principal and Claude capability restrictions.
  Ingest holds one guard through its exec into enrichment. Nested Docker calls
  obtain compatible shared deployment locks. Global and serialization lock
  descriptors survive exec. A surviving Docker worker blocks deploy preflight.
  User services cannot write trusted state: workers open deploy.lock read-only
  and take it shared, deploy takes it exclusive, and its inode stays stable
  across every transaction. A worker waits for the shared lock for up to
  WORKER_LOCK_WAIT_SECONDS (120 s, host.py), retrying a non-blocking flock
  every LOCK_POLL_SECONDS (0.5 s, dispatcher.py), so a policai-pull run (about
  6 s) delays a worker instead of refusing it. A deployment still holding the
  lock when the wait ends refuses the worker with "deploy.lock busy". Deploy,
  rollback, initialize and status keep one non-blocking attempt, so a pull that
  arrives while a worker holds the shared lock refuses at once, as before. No
  wait cycle exists: a waiting worker holds no lock, every holder takes
  deploy.lock before worker.lock, and the nested Compose call's shared lock is
  granted at once because its own worker already shares it. worker.lock stays
  non-blocking: a second worker refuses with "worker.lock busy", since ingest
  holds it for minutes, longer than any useful wait.
  Do not install/edit/unmask either digest unit. Verify masked AND inactive.

  installed_hashes must contain the exact paths shown in config.example.json.
  These are FILE proofs, not effective systemd/drop-in proofs. Verify effective
  ExecStart/User/WorkingDirectory, all drop-ins and loaded unit state separately.
  If current installed names differ, reconcile code/config/unit routing under
  review; do not create competing schedules to satisfy a filename check.

EXACT CLI (INSTALLED ROOT CODE ONLY)
  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py initialize
    Reads baseline.json. Verifies current source/artifacts/images/health and
    writes bootstrap_pending. Workers remain blocked. Initialization is one-shot.

  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py deploy --initial
    Always uses approved_target and builds BOTH runtimes, even when HEAD matches.
    Both candidate builds finish before either active runtime changes.

  /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py status
    Metadata only. It does not claim live health.

  Normal system timer entrypoint: /usr/local/libexec/policai-deploy
    Default follow_main=false pins approved_target. For restored normal
    automatic collection/ISR deployments, explicitly review follow_main=true
    AFTER initial verification. It resolves main inside the locked/latched
    transaction, requires both fetched heads to agree, and rejects divergence.
    classify() routes each changed path by the first matching ROUTES row; a
    change set selects the union of its paths' lanes. A lane not selected
    fast-forwards in place without a build or restart (the merge --ff-only
    branch of host.py activate()), and health() runs after activation for
    every change set, including one that selects no lane. Both checkouts
    therefore hold the new commit after every verified cycle. That invariant
    makes the Markdown row safe: the enrichment worker reads
    apps/probono/RUNBOOK.md from the checkout at run time
    (apps/probono/ops/enrich.sh, prompt="$(cat RUNBOOK.md)"), not from an
    image, so a no-lane change to it is live on the next cycle.
      no lane: test files (*.test.ts, *.test.tsx, any __tests__/ directory),
        data/ and public/data/ (served through ISR), Markdown outside any
        public/ directory, docs/, .github/, ops/host/ (installed by install.py),
        ops/collector/ (runs from its own checkout) and scripts/.
      Pro Bono only: apps/probono/. Its Compose build contexts are
        apps/probono/dashboard and apps/probono/worker (validate_compose
        enforces this), so no root file reaches its images.
      Policai only: src/, public/, mcp/, design/, package.json,
        package-lock.json, tsconfig.json, next.config.ts, next.config.js,
        next.config.mjs, postcss.config.mjs and components.json.
      both: every other path, the safe default.
    No scripts/ file runs during `npm run build` or under `next start`: the
    root package.json has no pre/post hooks and only test files import from
    scripts/. Route a script back to Policai if that changes. Tailwind's source
    scan reads every tracked text file, but a file outside src/ can only add or
    drop utilities no compiled component uses. A failure blocks every
    subsequent timer cycle.

  Deploy result: a verified deploy prints one JSON line to stdout, which the
  policai-pull.service journal records:
    {"verified": true, "activated_lanes": ["policai"], "main": "<sha>",
     "heads": {"policai": "<sha>", "probono": "<sha>"}}
    verified and activated_lanes keep their meaning and lead the line, so
    parsers that match that prefix still work. activated_lanes lists the
    rebuilt lanes; it is empty for a no-lane change set and for a cycle where
    main did not move. main is the target the locked transaction deployed:
    the resolved main that both fetched heads matched, or approved_target when
    follow_main is off (prepare() also requires it to equal fetched main).
    heads is the per-checkout commit written to active.json. To prove a merge
    deployed, find a run whose main equals the merge commit or a descendant of
    it; do not infer it from run timing. A refused or failed run prints no
    result and no SHA, exits 1 and leaves the persistent gate.

FAILURE / RECOVERY
  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py rollback
    Uses blocked.json and retained files/images. Stops affected root before
    rollback swaps. Repeated directory rollback is supported. Failed builds do
    not trigger runtime restarts. Data-only rollback uses one attached-branch Git
    switch, not a detach/reset sequence. A real-Git regression interrupts after
    each completed switch and verifies repeated recovery for both release clones.
    Successful rollback leaves blocked.json intact.

  Review the failure; fix main using normal history. Put the reviewed target SHA
  in approved_target and the exact failed transaction ID in recovery_authorization.
  Then, in the reviewed window:
    sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py deploy --recover ID
  Add --initial if recovering initial bootstrap. Requires a healthy verified
  rollback. Archives the previous marker, retains exclusion without a clear-gate
  gap, and deploys only the explicit target. The gate clears only after health.
  Remove recovery_authorization after verification. Never delete blocked.json,
  restore an ungated legacy helper or force-push to bypass recovery.

LIMITATIONS / REMAINING CUTOVER GATES
  Installer tests prove file recovery at the tested preparation/replacement/restore
  checkpoints and refusal of unrelated edits. They do not prove live systemd or
  database cutover. First-install rollback is refused after dispatcher initialization;
  from that point file changes go through upgrade and its own rollback, and
  release recovery through the separately reviewed application recovery procedure.
  Gates 4 to 6 of the upgrade contract are tested with recorded systemctl output
  and fixture state and config files built from the live key shapes, not
  against live systemd, the installed tree or the live config.
  Offline tests exercise real processes, locks, filesystem swaps, CLI refusal and
  Compose config parsing against isolated fixtures. Git/Docker/systemd mutations
  are command-recording/failure fixtures, NOT a live full-stack rehearsal.
  Effective systemd hardening and public HTTPS fetching inside its sandbox, full
  application builds, live Docker activation/rollback, and public routing still
  require the approved window and independent review. The separate protected
  same-snapshot DB restore report is evidence, not permission to skip fresh
  cutover identity checks.
  Root health proves readable deployed build ID + running service + successful
  API response; it is not a cryptographic attestation of code inside a process.
  Child HTML health is tied to the current Source health/table markup and readonly
  DB identity. Source collection failures are not falsely treated as deploy failure.
  Commands suppress raw output deliberately. Diagnostics are phase/identity based;
  investigate failures with separately approved, redacted observations.
  Builds run under existing app identities, NOT a hostile-code sandbox. Review
  dependency lifecycle/build scripts; the same UID can access its live checkout.
  State retains old artifacts and candidate images; this bundle never prunes them.
  Backups are bounded to 128 MiB of uncompressed output in the adapter. Exceeding
  that bound fails before replacing an existing backup. A backup is not a restore
  drill. The pre-cutover recovery dump must stay outside nightly rotation.
  Same-filesystem directory rollback covers tested interruption points, but is
  not a power-loss hardware certification. Independent code review remains open.
