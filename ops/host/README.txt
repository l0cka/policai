TWO-RUNTIME HOST DISPATCHER — REVIEW BUNDLE, NOT INSTALLED

Entry point: cli.py
Safe local demonstration: ./cli.py --help
Installation preview: python3 -I install.py plan
Tests: python3 -B verify.py
CI: the Host dispatcher job checks MANIFEST.sha256 before running verify.py.
Tests need Python >=3.11, Git and the Docker Compose plugin; Compose configuration
is parsed locally without a daemon. No production accounts or root access are needed.
verify.py regenerates MANIFEST.sha256; review its diff when changing this bundle.
Detailed window and rollback procedure: INSTALL-REVIEW.txt
No invocation from this user-owned bundle can pass the CLI installation guard.
Do not run this bundle as root. Review and install a fixed snapshot first.

WHAT EXISTS
  install.py: first-install file transaction with protected source-manifest checks,
  held-job preflight, original-file backups and repeatable pre-initialization rollback.
  It installs 11 explicit files only. It does not provision release clones, environment,
  config, state directories or locks, reload managers, start jobs, or activate runtimes.
  units/probono-*.service: guarded worker entrypoints; existing timers remain separate.
  dispatcher.py: four-class routing, stable flock exclusion, fsynced journals,
  retained-directory activation and rollback, persistent failure gate, reviewed
  recovery with preserved prior failure records.
  host.py: bounded subprocess/identity adapters; fixed Git, systemd, Compose,
  database identity and HTTP health checks; worker/backup guard.
  cli.py: initialize / deploy / rollback / status / worker / compose.
  bin/docker: allowlisted nested Compose adapter for ingest and enrichment.
  backup.sh: canonical-path variant of the existing backup helper; same dump,
  gzip/content/size checks and 14-day/newest-five retention semantics.
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
  2. Install cli.py, host.py, dispatcher.py, backup.sh and bin/docker below
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
  Working directory: /var/lib/probono-radar/app/apps/probono.
  Preserve original schedules, principal and Claude capability restrictions.
  Ingest holds one guard through its exec into enrichment. Nested Docker calls
  obtain compatible shared deployment locks. Global and serialization lock
  descriptors survive exec. A surviving Docker worker blocks deploy preflight.
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
    Data-only changes fast-forward without builds/restarts. Child-only changes
    build/activate dashboard+worker selection without restarting Policai.
    Root-only code changes rebuild/restart Policai only. Shared/unknown paths
    conservatively rebuild both. A failure blocks every subsequent timer cycle.

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
  database cutover. Installation rollback is refused after dispatcher initialization;
  use the separately reviewed application recovery procedure from that point onward.
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
