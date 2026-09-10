# Sandbox and public-origin review addendum

Verdict: HOLD for production installation. These changes form a new source
candidate; they do not approve or install a release. The original 42-test
acceptance snapshot and its findings remain preserved.

## Implemented in the candidate

- Require the exact public read-only origin
  `https://github.com/l0cka/policai.git`. Reject SSH URLs, credential-bearing
  URLs, alternate hosts, query strings and non-strings. Disable Git credential
  helpers and HTTP extra headers in deployment Git commands.
- Give deployment Git a home at its release parent. Give Docker/Compose
  deployment clients HOME `/var/lib/probono-radar` and DOCKER_CONFIG
  `/var/lib/probono-radar/.docker`. Provision this Docker client directory with
  l0cka ownership and mode0700 during the reviewed installation. This is
  client/build state, not a new credential grant. User workers retain their
  ordinary `/home/l0cka` context for Claude outside the system deploy unit.
- Keep ProtectHome=true, ProtectSystem=full, PrivateTmp=true,
  RestrictSUIDSGID=true and the other existing hardening in the draft unit.
  Bind ONLY `/home/l0cka/.config/systemd/user` read-only to
  `/run/policai-deploy-observation/user-units` in the service namespace.
  The dispatcher maps canonical unit hash checks and digest-mask symlink checks
  to that view when present. Direct operator CLI use falls back to canonical
  files when the service-private view is absent. It does not use copied unit
  mirrors as a substitute for current files.

## Important correction to the proposal

The installed systemd.exec manual explicitly says BindPaths/BindReadOnlyPaths
cannot bind below `/home` when ProtectHome=yes makes it inaccessible. A bind
with the same source and destination would not solve the problem. The draft
uses a destination under `/run` instead; it does not weaken ProtectHome.

## Executed evidence

- A clean-environment `git ls-remote` with HOME=/nonexistent, global/system Git
  configuration disabled, credential helpers and HTTP extra headers cleared,
  and prompts disabled returned the exact branch head
  `3c8a170186d2da1ba443c33055ac93a2afa2476c` for `refs/heads/bob/amalgamation`.
  This was NOT executed inside the final systemd sandbox.
- Three new tests were individually observed RED before implementation, then
  GREEN: exact public origin, deployment client home isolation, and user-unit
  observation alias selection. Logs are numbered 17, 18 and 19.
- Full candidate verification: 45 passing tests, including 41 host tests and
  4 compatibility tests. Python syntax checks cover 18 files; shell syntax
  checks cover 2 files. Full evidence: `logs/FINAL-VERIFICATION.json`.
- Ruff lint and formatting pass for the explicit project sources. A first
  broad lint invocation accidentally included a cached third-party Ruff
  package; the project-only rerun passed without changing that dependency.
- `systemd-analyze verify units/policai-pull.service` exits0 without diagnostics.
  This validates unit syntax, not mount behavior, privilege transitions,
  Docker builds or application activation.
- The refreshed source manifest validates. The old review tarball is still
  superseded and must not be installed.

## Remaining acceptance gates

1. Review and version this exact host-source/unit candidate. Dave authored these
   fixes, so his own tests are not independent approval. Bob's application
   evidence is attributed to Bob; GitHub CI remains unproven.
2. Produce and validate a reversible installation transaction: exact effective
   user units, protected environment/configuration, clean release clones,
   Docker client state, rollback artifacts and topology changes. This candidate
   does not yet include that executable installer.
3. In an authorized privileged terminal, prove the actual unit namespace has
   ProtectHome enabled, a genuinely read-only live unit-directory bind at the
   exact /run path, matching source hashes and unchanged /dev/null digest
   symlinks. Verify the actual user-manager state separately. Prove HTTPS
   fetch and Docker client/build behavior under the final sandbox.
4. Coordinate timer hold and main publication. Do not merge while the old helper
   can deploy main. Installation and activation require runtime/DB/network
   invariants and topology OK, not just passing offline tests.

The agent session remains unable to elevate privileges under NoNewPrivs.
No bypass is authorized or attempted. No production unit, timer, checkout,
container, database, network or access configuration was changed by this work.
Only review artifacts and tests were edited; no main merge or deployment ran.

## Subsequent source work: 11 September 2026

The earlier acceptance snapshot above is preserved. The current candidate adds
`install.py` and three guarded worker service files, with a preview and an
executable transaction for the 11 public helper/unit files. Installation rollback
is available before dispatcher initialisation; protected config, release clones,
backup/restore proof and actual sandbox verification remain separate gates.
See `INSTALL-REVIEW.txt` for the exact staging and invocation procedure.

The expanded offline suite passes 55 tests. Fixtures cover interrupted file
replacement/restoration, original absence, changed backups and unrelated edits,
plus retained directory descriptors when an ancestor is replaced. Host tests no
longer require production accounts. The candidate units pass systemd syntax
verification. The repaired GitHub workflow includes the host suite, but remote CI
and privileged installation/activation evidence remain outstanding.
