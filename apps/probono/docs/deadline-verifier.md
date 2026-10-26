# Deadline verifier

A narrow second pass over items whose action deadlines matter now. Enrichment
reads each item once, and the 2026-09 audit found its errors are judgement
errors (kind, precision, primary versus secondary), not misread dates. The
verifier re-reads the source page and checks every stored date.

## What it does

1. `worker/src/list-deadlines-to-verify.ts` selects items (relevant, with a
   day-precision action date that is upcoming or closed in the last 30 days)
   that are due a check: never verified; verified more than 7 days ago; an
   upcoming date within 7 days and not checked today (the T-7 re-check); or a
   date that passed since the last check. Soonest upcoming first, batch of 25.
   The rules are `selectItemsToVerify` in `worker/src/lib/deadline-verify.ts`.
2. `worker/src/verify-deadlines.ts` fetches each source page itself
   (Firecrawl at `FIRECRAWL_URL`, then a plain GET; bot-wall pages count as
   unreadable and the item is skipped), and checks each stored date against
   the page text with `worker/src/lib/deadline-check.ts` (no model; see
   Checker below). It only reads the database and prints one proposal per
   item.
3. `ops/verify-deadlines.sh` checks the batch shape with `jq` (integer, unique
   item IDs; at most 25) and pipes each `{model, output}` to
   `worker/src/save-deadline-verification.ts <item_id>`.
4. The saver re-applies the verdicts to the item's **current** deadlines under
   a row lock (`applyVerification`), using the same save-time rules as
   enrichment (`vetDeadlines`: the quote must name the day for day precision,
   opening/event wording is a milestone, at most one primary). Only verdicts
   that pass replace a stored date; `closed` or `not_found` clears `primary`
   and records `status`. It writes `entities.deadlines`,
   `entities.deadlines_verified_at` and `entities.deadline_verification` (the
   last five audits: model, time, previous deadlines, per-date outcome). JSONB
   only; no table migration.

The dashboard shows "Checked against the source <date>" on cards with
`deadlines_verified_at`, and drops `closed`/`not_found` dates from Closing soon
and the calendar (`not_found` also from Recently closed). The digest skips
them too.

## Checker

Code, not a model. Until 26 Oct 2026 this was DeepSeek V4.1 Flash on Ollama
Cloud; its key stopped working on 23 Oct. On the 13 items DeepSeek had last
verified, the checker gave the same answer on all 12 dates still on their
pages, where local qwen3:14b got 10 (it called a commencement and an expo
date action deadlines) and timed out once. Clef cannot do this job: it only
answers yes/no and scoring questions.

For each stored date `checkDeadlines`:

- finds the date in the page text (`2 November 2026`, `Friday 2 Nov`,
  `June 30, 2027`, `02/11/2026`, ISO, `1–13 November`; the year may be left
  out unless a different year follows). Month and year dates match `December
  2026` and `by 2027`. No match is `not_found`;
- quotes the sentence or line holding it;
- reads the kind from the nearest keyword, which must sit within 40
  characters before or 30 after the date:
  close, submissions, until, due, deadline mean `action`; commence, opens,
  election, expo, event, takes effect and a `Date:` heading mean `milestone`;
- marks `extended` when the date's sentence or the next one says a close was
  "extended to", "postponed until" or has a "new closing date" of a later
  date written straight after those words (not negated; day- or
  month-first; a yearless date in an earlier month rolls into next year),
  and quotes that sentence instead; otherwise `closed` when the period has ended (end of
  month or year for those precisions) or the sentence says closed, else
  `open`;
- makes the single action date primary, or the one whose quote says close,
  submit, due or until. A tie keeps the stored primary.

When a date appears several times, the kind most mentions agree on wins.
A date with no keyword either way, or whose mentions split evenly, gets
no verdict, so the saver leaves it as stored and the run logs `left
unchanged`. An item with no verdicts at all is not saved, so it stays in the
next day's queue. Proposals carry `model: "deterministic-v1"`.

## Host dispatcher (installed)

Scheduled worker tasks run through the root-owned guarded dispatcher, which
allowlists them. The change below **is installed** — the A2J cutover on
2026-09-23 22:19 AEST put the verifier on the daily schedule. The dispatcher
allowlist (`cli.py worker verify-deadlines`, the saver's stdin path, the
`host.py` worker arguments and permitted names, and the stdin permission) is
installed and its file hashes are recorded, hash-pinned, in the root config
`installed_hashes`. The unit files
`/home/l0cka/.config/systemd/user/probono-verify-deadlines.service` and
`.timer` (daily 07:10 Sydney) are installed and active; the service unit's
hash is in `installed_hashes`. The release running the verifier is the live
tree `/var/lib/probono-radar/app/apps/probono`. The checker needs no credentials; the
old `VERIFIER_BASE_URL`, `VERIFIER_MODEL` and `VERIFIER_API_KEY` lines in
`/etc/probono-radar/runtime.env` are unused since 26 Oct 2026.
The sections below record what was installed, as the reviewed record of the
change:

1. `/usr/local/libexec/policai-host/cli.py`, the `worker` sub-command —
   installed:

   ```python
   worker.add_argument("operation", choices=("ingest", "enrich", "backup", "verify-deadlines"))
   ```

   and in the `compose` branch the saver's stdin is accepted (same 256 KiB
   bound):

   ```python
   if "src/save-enrichment.ts" in command or "src/save-deadline-verification.ts" in command:
   ```

2. `/usr/local/libexec/policai-host/host.py` — installed:
   - `worker_arguments`: allows `src/verify-deadlines.ts` with no parameters
     (beside `src/fetch-all.ts` and `src/list-unenriched.ts`), and
     `src/save-deadline-verification.ts` with exactly one item ID matching
     `[1-9][0-9]{0,12}` (as `src/save-enrichment.ts`).
     `src/list-deadlines-to-verify.ts` is a manual inspection tool; it is not
     allowlisted.
   - `run_worker`: has `"verify-deadlines"` among the permitted names (the
     script is `ops/verify-deadlines.sh`). `PROBONO_CLAUDE_BIN` is not used
     by it.
   - `worker_compose`: permits stdin when the allowed command contains
     `src/save-deadline-verification.ts`.
   - Installation proof: the preflight `required` set includes
     `/home/l0cka/.config/systemd/user/probono-verify-deadlines.service` and
     its hash is recorded in the root config `installed_hashes`.

3. `/etc/probono-radar/runtime.env`: no verifier settings needed since the
   checker replaced the model (26 Oct 2026).

4. User units: `ops/probono-verify-deadlines.service` and
   `ops/probono-verify-deadlines.timer` (daily 07:10 Sydney) are installed in
   `/home/l0cka/.config/systemd/user/`, matching the existing enrich unit
   (`ExecStart=/usr/bin/python3 -I /usr/local/libexec/policai-host/cli.py worker verify-deadlines`).

5. A worker image built from a release that contains these files. The
   container needs the source pages (it uses host networking, as
   enrichment's fetches do) and the existing Firecrawl entry point.

## Open incident: 2026-09-24 Refused runs

All three guarded probono jobs refused on 2026-09-24 — `worker ingest`
(06:00), `worker backup` (02:35) and `worker verify-deadlines` (07:10) each
logged "Refused: guarded operation failed. Inspect status and reviewed
prerequisites; no automatic retry." and exited 1, so the systemd units
`probono-ingest.service`, `probono-backup.service` and
`probono-verify-deadlines.service` show failed results. The root cause is
unknown: the documented diagnostic route is the dispatcher's nonsecret
transaction view, `sudo /usr/local/libexec/policai-host/cli.py status`, which
has deliberately not been run yet (root operator action; nothing in the
dispatcher or units may be changed or retried automatically). Next scheduled
runs are the observation points if the incident is still open: ingest 06:00,
backup 02:30, verify-deadlines 07:10 (all Sydney time, next morning).

Each save is its own `docker compose run` like enrichment, so a batch of 25
starts up to 26 containers; the verify step itself is page fetches only.

## Running by hand (read-only)

```bash
cd apps/probono/worker
DATABASE_URL=... npx tsx src/list-deadlines-to-verify.ts          # what would be checked
DATABASE_URL=... npx tsx src/verify-deadlines.ts > proposals.json  # proposals, no writes
```

Only `save-deadline-verification.ts` writes.
