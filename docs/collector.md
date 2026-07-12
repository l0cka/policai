# Collector Operations

The collector is the automation behind the Developments feed: it watches official Australian government pages and feeds for new AI-policy activity and records what it finds in the repo's data files. It replaced the old Vercel-cron scraper/pipeline in July 2026.

## What one collection pass does

1. Loads the seen-URL registry (`data/watch-state.json`) and the existing feed (`public/data/developments.json`).
2. For each enabled source in [`src/lib/pipeline/sources.ts`](../src/lib/pipeline/sources.ts) that is due (daily sources every run, weekly sources every 6+ days):
   - fetches the index page or RSS feed,
   - extracts AI-relevant, dated link candidates ([`extract.ts`](../src/lib/pipeline/extract.ts)),
   - drops anything already seen,
   - fetches each new page and classifies it ([`classify.ts`](../src/lib/pipeline/classify.ts)).
3. Writes results:
   - detections (score ≥ 0.5) → `public/data/developments.json`,
   - high-confidence detections (score ≥ 0.7) → also staged in `data/source-reviews.json`,
   - every extracted URL → `data/watch-state.json`,
   - run metadata (freshness, per-source errors) → `public/data/meta.json`.
4. The collector **never writes `public/data/policies.json`** — the register only changes through reviewed commits, and the GitHub workflow fails if a collector run touches it.

## Classification modes

| Mode | Trigger | Behaviour |
|---|---|---|
| AI | `ANTHROPIC_API_KEY` (preferred) or `OPENROUTER_API_KEY` set | Page content analysed by the model in `src/lib/ai-client.ts` (override with `AI_MODEL`); detections carry the model's relevance score |
| Heuristic | no key | Keyword scoring only; confidence capped at 0.65 so items always display as "Needs review" |

## Running locally

```bash
npm run collect -- --dry-run              # preview, writes nothing
npm run collect -- --source=apra-rss      # one source
npm run collect                           # full pass, writes data files
npm run validate:data                     # structural checks (same as CI)
```

Note: several federal sites (dta.gov.au, industry.gov.au, ag.gov.au, and others behind aggressive bot protection) may refuse non-browser clients depending on your network. Per-source failures do not abort the run — they are listed in `meta.json` under `collector.lastRunErrors`.

## Production automation

[`.github/workflows/collect.yml`](../.github/workflows/collect.yml) runs daily at 19:30 UTC (~05:30 Sydney):

1. `npm run collect`
2. `npm run validate:data`
3. Guard: fail if `public/data/policies.json` changed
4. Commit `developments.json`, `meta.json`, `watch-state.json`, `source-reviews.json` and push
5. On any failure: open (or comment on) an issue labelled `collector-failure` so scheduled breakage is never silent

The push triggers a Vercel deployment, so the site republishes with the new data. Manual runs: Actions → "Collect AI policy developments" → Run workflow (optionally with a single source id).

**Repository configuration:**

- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` secret (optional, enables AI classification)
- `AI_MODEL` repository variable (optional model override)
- `COLLECTOR_DEPLOY_KEY` secret — private half of the repo's write deploy key ("collector (collect.yml push)"). Checkout uses it (`ssh-key:`) so the push authenticates as the deploy key, and the "Protect main" ruleset lists **Deploy keys** as a bypass actor (`bypass_mode: always`). Without this pair the push is rejected with `GH013: Repository rule violations` — the default `GITHUB_TOKEN` cannot be a bypass actor on a user-owned repo. The safety story does not depend on the ruleset here: the registry-guard step and CI both enforce that automation never touches `policies.json`.

Without secrets the workflow still runs in heuristic mode.

## Reviewing detections into the register

Detections staged in `data/source-reviews.json` are proposals. To publish one:

1. Run the local MCP server (`npm run mcp`) and use its review/publish tools, or edit the data directly.
2. Publishing creates the policy record (via `src/lib/source-ingest.ts` → `createPolicy`) in `public/data/policies.json`.
3. Run `npm run validate:data`, commit, and push (or open a PR).

Dismissals: set the review's status to `rejected` (it will be skipped thereafter), and optionally set the matching development's status to `dismissed` to hide it from the feed.

## Adding or fixing a source

Edit [`src/lib/pipeline/sources.ts`](../src/lib/pipeline/sources.ts). Each source needs an id, name, jurisdiction, category (`government | regulator | court`), URL, kind (`html-index | rss`), and schedule (`daily | weekly`). Prefer dated index/news pages or RSS feeds. Verify with:

```bash
npm run collect -- --dry-run --source=<id>
```

## Troubleshooting

- **The workflow fails at `git push` with `GH013: Repository rule violations`** — the deploy-key bypass is broken: either the `COLLECTOR_DEPLOY_KEY` secret / write deploy key was removed, or "Deploy keys" is missing from the "Protect main" ruleset bypass list (Settings → Rules → Rulesets → Protect main → Bypass list, or `gh api -X PUT repos/l0cka/policai/rulesets/<id>` with `{"actor_type": "DeployKey", "bypass_mode": "always"}` in `bypass_actors`).
- **A source keeps failing** — check `meta.json` → `collector.lastRunErrors`. 403s usually mean bot protection; try from a different network, or disable the source with `enabled: false` and a `notes` explanation.
- **Nothing new detected** — expected on most days; the feed only grows when monitored pages change. Check `watch-state.json` to confirm URLs are being seen.
- **Validation fails in CI** — run `npm run validate:data` locally; it prints every structural error with the offending record id.
