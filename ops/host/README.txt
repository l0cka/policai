PRO BONO HOST DISPATCHER: INSTALLED, LIVE DEPLOY PATH

The dispatcher is installed and is the live deploy path for the Pro Bono
release checkout and worker image on Argus. Both public sites run on
Cloudflare Workers (docs/hosting-argus.md), so the Policai server and the
dashboard container that earlier versions deployed here are retired; see
RETIRED RUNTIMES under UPGRADE CONTRACT for the install window that removes
them. /usr/local/libexec/policai-host holds a copy installed from this bundle through
install.py. That copy can lag main until the next reviewed install.
cli.ENTRYPOINT names that directory. host.CODE, the install.py FILES
destinations, bin/docker and policai-deploy (which hard-code the entrypoint),
the config.example.json installed_hashes keys, the INSTALL-REVIEW.txt install
paths and the probono-*.service ExecStart lines repeat it, because cli.py
checks its own path before it imports any sibling module and install.py and
the units import nothing. test_install.InstallDirectoryTests fails when any
of them differs from cli.ENTRYPOINT.

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
  install.py: file transactions over the 15-entry install set (FILES: source name,
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
  host.py: bounded subprocess/identity adapters; fixed Git, Compose, database
  identity and listener checks; worker/backup guard.
  cli.py: initialize / deploy / rollback / status / worker / compose.
  bin/docker: allowlisted nested Compose adapter for ingest, enrichment and
  deadline verification.
  backup.sh: canonical-path variant of the existing backup helper; same dump,
  gzip/content/size checks and 14-day/newest-five retention semantics. Its two
  Docker calls are the only exec forms worker_arguments allows, exactly
  pg_dump -U radar radar and pg_dumpall -U radar --globals-only (BACKUP_DUMPS).
  Rotation runs only after both dumps pass their checks.
  neon-sync (host.py, no script): replaces the Neon copy of the radar
  database that the a2j Worker reads through Hyperdrive. Argus stays the
  database of record. It runs one fixed script (NEON_SYNC_SCRIPT) inside the db
  container: pg_dump over the local socket, a check for the dump's completion
  line, then, only when the dump differs from the last one sent, DROP SCHEMA
  public, CREATE SCHEMA public and the dump in a single psql transaction with
  verify-full TLS. A failed copy rolls back and leaves the old copy serving;
  the digest is written only after a copy commits, so the next run retries.
  The destination comes from NEON_DATABASE_URL in /etc/probono-radar/neon.env
  (root:l0cka 0640, no world bits, no group write), which must be a direct
  *.aws.neon.tech endpoint, not -pooler. Host, user and database pass as -e
  variables; the password goes on stdin, never into argv or the environment.
  Its guard is "database", like backup. It takes deploy.lock shared but not
  worker.lock: a pg_dump snapshot is consistent while ingest or enrich write,
  so an hourly run never refuses on a long ingest. Each run dumps to its own
  mktemp file and copies in one transaction, so two runs cannot mix. The cli prints "synced" or
  "unchanged". The timer is apps/probono/ops/probono-neon-sync.timer (hourly).
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
  Pro Bono: /var/lib/probono-radar/app/apps/probono, commands as l0cka. The
  only lane. No new Docker principal. Nothing listens for the sites on Argus:
  policai.org and a2j.policai.org are Cloudflare Workers.
  Existing Postgres container, cluster, image, volume and port 5433 stay fixed.
  Compose project probono-radar; external volume probono-radar_pgdata;
  external network probono-radar_default. Compose services are db and worker
  only (validate_compose refuses any other set). Activation builds the worker
  image from the candidate checkout, swaps the checkout and writes
  active-compose.json; it starts no container. No DB up/down, migration or
  seed command.
  Health after activation, and before each deploy (preflight), is
  health_snapshot: verify_database (container id, image, running and healthy,
  the pgdata volume, the 127.0.0.1:5433 port map, the Compose labels, the
  volume and network, the cluster identifier), the active worker image
  present in the image store, and ss showing exactly one listener on :5433,
  bound to 127.0.0.1. There is no HTTP probe and no retry loop: each check
  is a settled identity, so a failure refuses at once.
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
     artifacts/probono/candidates and artifacts/probono/retained.
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
       backup, backup-mirror, verify-deadlines, neon-sync) inactive with no
       drop-ins (neon-sync may also be not-found, before its first install), both
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

  RETIRED RUNTIMES: config and window for the change set that retires the
  Policai server and the dashboard container. The installed dispatcher
  still builds the Policai lane, runs the dashboard and requires three
  Compose services. This change set removes all three, changes
  apps/probono/docker-compose.yaml (dashboard service gone) and changes the
  shape of active.json. Four consequences bind the window:

    a. Hold policai-pull.timer BEFORE the change set reaches main and keep
       it held until step d. The installed code classifies the Compose
       change into the Pro Bono lane, refuses the new file ("Compose source
       requires new review", because config.json still holds the old
       compose_sha256) and blocks. A block refuses upgrade apply (gate 5),
       and the installed code cannot deploy the new file, so a cycle that
       runs between merge and apply costs a reviewed recovery.
    b. compose_sha256 changes. check_compose_source hashes the bytes of
       apps/probono/docker-compose.yaml in the checkout being validated
       (sha256 of the file, lowercase hex). Compute it from the merged
       commit, never from a worktree:
         git show "$COMMIT:apps/probono/docker-compose.yaml" | sha256sum
       and write it to compose_sha256 in /etc/policai-deploy/config.json
       after apply and before the timers return. The installed code reads
       the key too, so the new value cannot go in early: it would refuse
       every cycle until apply.
    c. installed_hashes keeps the same keys (policai-pull.service stays the
       dispatcher's system unit and no unit file changes) and takes the new
       digests of cli.py, host.py and dispatcher.py after apply.
    d. The first deploy under the new code reads the installed active.json
       ({heads: {policai, probono}, root_build, images: {dashboard,
       worker}}) through dispatcher.parse_active, keeps the probono head and
       worker image, and writes the new shape ({heads: {probono}, images:
       {worker}, target}). It also rewrites active-compose.json from the
       worker image, which drops the dashboard service from the overlay.
       Until that deploy, release workers refuse ("worker image selection
       differs from active release"), because the old overlay names a
       service the new code does not accept, so restore the pull timer
       before the ingest, enrich and verify-deadlines timers. The merged
       change set selects the Pro Bono lane, so that deploy builds the
       worker image and prints
         {"verified": true, "activated_lanes": ["probono"], "main": "<sha>",
          "heads": {"probono": "<sha>"}}
       The new code never touches policai.service, 8794, 8850 or the
       dashboard container, so both may keep running through that deploy.

  Window order: hold the triggers (INSTALL-REVIEW.txt step 2, the pull timer
  first), merge, copy /etc/policai-deploy/config.json and the state files
  active.json and active-compose.json aside, stage the snapshot, upgrade
  plan, upgrade apply, edit config.json (b and c), restore the pull timer
  and wait for the verified line in d, restore the user timers. Then, as
  operator acts outside this bundle: systemctl stop and disable
  policai.service (leave its unit and the policai account for the operator
  to remove or keep); remove the dashboard container, which the Compose
  project no longer owns, with docker rm -f probono-radar-dashboard-1 as
  l0cka; retire /var/lib/policai/app, the policai artifacts under
  /var/lib/policai-deploy-state/artifacts/policai and the retained
  dashboard images when the retention review allows; and remove the
  Policai service, the dashboard container, 8794 and 8850 from
  topology.json and its rendered document.

  Rollback of this change set. Before the first deploy under the new code,
  install.py upgrade rollback plus the saved config.json restores the
  previous host in full: no state file has changed, policai.service and the
  dashboard container are still running, and the checkout still holds the
  old Compose file. After the first verified deploy, rollback to the
  installed code is unsupported and a forward fix is the path. The upgrade
  journal holds only the install-set files, never active.json or
  active-compose.json, and the old code needs the old record shape
  (active["heads"]["policai"] and root_build in preflight), the dashboard
  container running at active["images"]["dashboard"], policai.service
  active, and a checkout whose Compose file has three services, which main
  no longer has. Restoring all of that is a new install, not a rollback.

  Fixture: tests/fixtures/installed-2026-09-11 holds the installed tree as
  observed on 2026-10-16 (cli.py, host.py, dispatcher.py, backup.sh and the
  backup-mirror unit; absent.txt lists backup-mirror.sh as not installed),
  reconstructed by reverse-applying Argus DevOps's installed-vs-b17bb52 diff.
  Every other install-set entry matched b17bb52 byte for byte. test_upgrade.py
  drives plan, apply, crash and rerun, rollback and the gates against it.

SERVICE ROUTING (REVIEW EXISTING HARDENING; NOT BLIND DROP-INS)
  System policai-pull.service remains the compatibility entrypoint. It must
  execute the new delegate as root. Git and Docker run as l0cka. The service
  needs permission for the release parent, trusted state and identity
  transitions. Its installed bytes are unchanged by the retirement (the
  Description still names both releases), so no unit hash moves. Do not
  remove hardening wholesale. Keep ProtectHome=true. The draft system unit binds ONLY the user
  unit directory read-only to /run/policai-deploy-observation/user-units, not back
  beneath inaccessible /home. Verify the actual bind, hashes and digest symlinks
  inside the final sandbox. The release origin must use the exact public URL
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
    /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker neon-sync
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
  Block scope: host.WORKER_GUARDS names what each operation must prove
  beyond identity and the two locks. ingest, enrich and verify-deadlines
  ("release") run the image and checkout of the active release, so they
  refuse under blocked.json ("persistent block: reviewed recovery required")
  and before the first activation. backup ("database") and backup-mirror
  ("mirror") do not read either: backup.sh and backup-mirror.sh are root-
  installed beside cli.py, the only Compose call is the db exec pg_dump pair
  and no deploy ever touches the db service or its volume. They skip
  require_ready and bootstrap_pending, so a failed deploy
  no longer stops the nightly dump or its mirror (2026-10-18: a ~24 h block
  left the database ~38 h without one). backup still proves the database
  identity (verify_database) and the Compose source digest and contract
  (validate_compose) before it dumps; backup-mirror needs only its
  backup_mirror config paths. neon-sync ("database") proves the database
  identity, like backup, and reads only neon.env. All three still take deploy.lock shared, so they
  never overlap a deploy, rollback or recovery, and worker.lock, so they
  never overlap another worker. The nested `cli.py compose` call picks its
  guard with host.compose_guard: the db exec pair is "database", every
  worker run task is "release". tests/test_block_tolerance.py pins the
  table, the guard and the CLI routing under a block. A block therefore no
  longer shows as a failed backup job; it still fails every release worker
  and every policai-pull run.
  The 2026-10-17 07:11:25 verify-deadlines refusal (issue #296) was not a
  deploy.lock collision: the unit ran 5.3 s, while a busy shared lock with the
  then-installed wait=0 path refused within one LOCK_NB poll and never slept.
  Overlapping pulls and other workers were ruled out from the journals. The
  duration matches a post-guard exit from ops/verify-deadlines.sh — nested
  Compose status 3 (VerifierAuthError), status 1 (fatal worker error), or
  jq -ce status 5 on a bad batch. The installed cli.py printed every failure
  as the same Refused line and discarded nested Compose stderr, so the exit
  status was lost. Named Failed/Refused lines and the compose syslog identity
  make the next instance diagnosable; tests/test_worker_guards.py
  (FailureLineTests exit-status table, VerifyDeadlinesScriptTests) pin the
  timing signature and those three script exits.
  Do not install/edit/unmask either digest unit. Verify masked AND inactive.

  installed_hashes must contain the exact paths shown in config.example.json.
  These are FILE proofs, not effective systemd/drop-in proofs. Verify effective
  ExecStart/User/WorkingDirectory, all drop-ins and loaded unit state separately.
  If current installed names differ, reconcile code/config/unit routing under
  review; do not create competing schedules to satisfy a filename check.

EXACT CLI (INSTALLED ROOT CODE ONLY)
  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py initialize
    Reads baseline.json ({heads: {probono}, images: {worker}}, see
    baseline.example.json). Verifies current source/image/health and writes
    bootstrap_pending. Workers remain blocked. Initialization is one-shot.

  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py deploy --initial
    Always uses approved_target and builds the worker image, even when HEAD
    matches. The candidate build finishes before the active checkout changes.

  /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py status
    Metadata only. It does not claim live health.

  Normal system timer entrypoint: /usr/local/libexec/policai-deploy
    Default follow_main=false pins approved_target. For restored normal
    automatic collection/ISR deployments, explicitly review follow_main=true
    AFTER initial verification. It resolves main inside the locked/latched
    transaction and requires the fetched head to equal the target.
    classify() routes each changed path by the first matching ROUTES row; a
    change set selects the lane when any path does. When no path selects it,
    the checkout fast-forwards in place without a build (the merge --ff-only
    branch of host.py activate()), and health() runs after activation for
    every change set, including one that selects no lane. The checkout
    therefore holds the new commit after every verified cycle. That
    invariant makes the Markdown row safe: the enrichment worker reads
    apps/probono/RUNBOOK.md from the checkout at run time
    (apps/probono/ops/enrich.sh, prompt="$(cat RUNBOOK.md)"), not from an
    image, so a no-lane change to it is live on the next cycle. The same
    holds for apps/probono/ops/*.sh, which the timers run from the checkout.
      no lane: test files (*.test.ts, *.test.tsx, any __tests__/ directory),
        Markdown outside any public/ directory, apps/probono/dashboard/ (the
        a2j Worker, built by Cloudflare), and every path outside
        apps/probono/, the default.
      Pro Bono: every other path under apps/probono/.
    The default is no lane because the worker image is built from
    apps/probono/worker alone (validate_compose refuses any other build
    context) and the only other image input is apps/probono/docker-compose.yaml,
    so a path outside apps/probono/ cannot change the image. The old
    "rebuild both" default protected a Next.js build that read root files;
    that build no longer runs here. A failure blocks every subsequent timer
    cycle.

  Deploy result: a verified deploy prints one JSON line to stdout, which the
  policai-pull.service journal records:
    {"verified": true, "activated_lanes": ["probono"], "main": "<sha>",
     "heads": {"probono": "<sha>"}}
    verified and activated_lanes keep their meaning and lead the line, so
    parsers that match that prefix still work. activated_lanes is ["probono"]
    when the worker image was rebuilt and [] for a no-lane change set or a
    cycle where main did not move. main is the target the locked transaction
    deployed: the resolved main, or approved_target when follow_main is off
    (prepare() also requires it to equal fetched main). heads is the
    checkout's commit written to active.json; it keeps its map shape, with
    the one key, so the line stays parseable by readers of the old form. To prove a merge
    deployed, find a run whose main equals the merge commit or a descendant of
    it; do not infer it from run timing. A refused or failed run prints no
    result and no SHA, exits 1 and leaves the persistent gate. One exception:
    a follow_main run that resolved its own target and fails before staging
    (phase preflight or target-resolved: a GitHub fetch during a network
    drop, or "approved target is not fetched main" when a merge lands
    mid-run) has built nothing and left active.json untouched. It records
    {count, failure} in deferred.json, removes its marker, prints "Refused:
    deployment deferred before staging; next cycle retries" and the next
    timer cycle tries again. The DEFER_LIMIT-th consecutive such failure (5,
    about 10 minutes) blocks as usual; a verified deploy removes
    deferred.json. cli.py status prints it as deferred. An explicit target
    (approved_target or --recover) and any failure from stage onwards block
    at once. Both 2026 blocks before this rule were pre-staging: a WAN drop
    on 2026-10-20 05:16 AEDT and #453 merging one second into a run that had
    resolved #447 on 2026-10-22 14:34 AEDT.

FAILURE / RECOVERY
  sudo /usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py rollback
    Uses blocked.json and retained files/images. Repeated directory rollback
    is supported. It rewrites active-compose.json from the before record's
    worker image and starts no container. Data-only rollback uses one
    attached-branch Git switch, not a detach/reset sequence. A real-Git
    regression interrupts after each completed switch and verifies repeated
    recovery. Successful rollback leaves blocked.json intact.

  Review the failure. A failed deploy records failure in blocked.json and
  cli.py status prints it: phase is the last checkpoint reached before the
  error (preflight, target-resolved, stage, activate or health), error is the
  exception type and, for a Refused, reason is its static public text. Other
  exception messages are never stored. A record without failure predates
  this field; the 2026-10-20 05:16 block was one, and its cause had to be
  inferred from timing. Fix main using normal history. Put the reviewed target SHA
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
  Health proves the database container identity, the presence of the active
  worker image and a loopback-only 5433 listener; it does not run the worker
  image. The public sites are not probed from Argus: their health belongs to
  Cloudflare Workers Builds and is outside this dispatcher.
  Commands suppress raw output deliberately. Diagnostics are phase/identity based;
  investigate failures with separately approved, redacted observations.
  Once its arguments parse, cli.py exits 1 on every Exception and prints one
  stderr line that never carries command output, exception details, config or
  environment. KeyboardInterrupt and SystemExit pass through, and argparse
  rejects bad arguments with its own usage message and exit 2. A refusal prints
  "Refused: <reason>. Inspect status and reviewed prerequisites; no automatic
  retry." with the static Refused reason, for example "deploy.lock busy: a
  deployment holds it", "worker.lock busy: another scheduled worker is running",
  "persistent block: reviewed recovery required", "scheduled workers must
  execute as l0cka", "worker command not allowlisted" or a Runner refusal before
  any process starts, such as "command input exceeds bound" or "command
  unavailable or timed out" when the process cannot be spawned. A guard probe
  that runs a process outside a worker task (git, docker image inspect, or the
  docker inspect calls in verify_database) and exits non-zero prints "Refused:
  command exited with status <n>. Inspect status and reviewed prerequisites; no
  automatic retry." One that times out or exceeds the output bound prints
  "Refused: command timed out. ..." or "Refused: command output exceeded bound.
  ..." with the same ending. Only a worker task whose process started and then
  failed prints "Failed: worker task <name>: command exited with status <n>;
  guards passed. No automatic retry." (or the Runner's "command timed out",
  "command output exceeded bound" or "command unavailable or timed out" in place
  of the exit status). <name> is the worker operation, or the allowlisted
  Compose task such as src/verify-deadlines.ts or pg_dumpall. Any other error
  prints "Refused: unexpected <exception type>. ..." with only its exception
  type. An unexpected AttributeError uses that form and drops the traceback, so
  the line can read like a missing prerequisite rather than a code bug. Other
  BaseException types that are not Exception still print a raw traceback with
  no syslog line; KeyboardInterrupt and SystemExit pass through unchanged. If
  building the line itself fails, for example because host.py cannot be
  imported, cli.py prints "Refused: failure report unavailable. Inspect status
  and reviewed prerequisites; no automatic retry." and still exits 1. The line
  never goes to stdout, the Compose adapter's data channel to the parent worker.
  With fd 2 closed, cli.py prints no line. When stderr is a full non-blocking
  pipe or a broken pipe, cli.py drops the line. In each case cli.py then
  replaces sys.stderr with a sink that discards later writes, so no later stderr
  write in the process reaches stdout. Each case still exits 1, and the Compose
  adapter still writes its syslog line at LOG_ERR. The parent worker captures
  and discards the nested Compose adapter's stderr, so the adapter also writes
  its line to syslog as policai-host-compose; journalctl --user -u
  probono-<worker> shows it beside the worker's own line. Nested Compose
  failures always exit 1, including a saver that exited 2, so the `2)` rejected
  branch in apps/probono/ops/enrich.sh cannot fire through the dispatcher.
  Builds run under existing app identities, NOT a hostile-code sandbox. Review
  dependency lifecycle/build scripts; the same UID can access its live checkout.
  State retains old artifacts and candidate images; this bundle never prunes them.
  Backups are bounded to 128 MiB of uncompressed output in the adapter. Exceeding
  that bound fails before replacing an existing backup. A backup is not a restore
  drill. The pre-cutover recovery dump must stay outside nightly rotation.
  Same-filesystem directory rollback covers tested interruption points, but is
  not a power-loss hardware certification. Independent code review remains open.
