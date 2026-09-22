# Editorial index (direction 02)

## Implemented scope

The root Next.js product uses the selected warm-paper / forest palette, Arial interface text, Georgia display text and a lowercase Policai identity. `PolicaiLogo.tsx` embeds the exact three companion-mark paths from `Work/Sandbox/policai-refresh/policai-mark.svg`, using `currentColor` for both themes. It is not a regenerated or traced image. The generated concept image is not a runtime dependency.

The register now leads with search, multi-select filter disclosures and eight readable records per page. Jurisdiction shortcuts, removable filter chips, combined filters, sorting, table/list modes, pagination, full-record navigation and official-source links remain available. Search and sort/filter changes return to the first page. Ctrl/Cmd+K focuses search. Escape closes a filter or navigation disclosure and restores focus. Theme radios support arrow keys, Home/End and one tab stop.

This is not a new dataset or an alternative demo. `src/app/page.tsx` still obtains records through the existing public data-service methods. Verification, withholding, non-public data, canonical files, APIs, date formatting and AI transports are unchanged. Automated developments remain a separate destination, explicitly distinguished from register records. The sidebar's recent developments still come only from the server-filtered verified subset. A2J remains an external navigation destination; no child-app files were changed.

Shared root theme/typography and navigation also apply to the existing root product's detail, developments, courts and explore pages. The old observatory hero is no longer mounted on the register. Its component is retained, not deleted. System fonts remove the former build-time Google Fonts fetch.

## Worktree and pending work

- Worker: `default:20260922_100635_619264`, native handle `sa-0-ef1576c6`.
- Coordinator: `default:20260919_154302_da2888d7`; board thread `7b5b979ed743`.
- Worktree: `/home/l0cka/Work/Argus/src/policai-editorial-index`.
- Branch: `feat/editorial-index-02`.
- Base: `0d81fc7` (main/origin-main at discovery; includes the existing pluggable classifier transport).
- No separate Policai development checkout existed under Argus/src or Sandbox. The serving repository's local-development reflog and refs supplied the base for this isolated worktree. Its working files were not edited.
- Changes are deliberately **uncommitted**. No push, deployment or production restart occurred.

The original `/home/l0cka/Work/Argus/live/policai` still contains unrelated pending work:

- `src/components/layout/Header.tsx`: adds `{ href: '/this-week', label: 'This week' }` after Register.
- `src/app/this-week/`, `src/lib/this-week.ts`, `src/lib/this-week.test.ts`.
- `apps/probono/dashboard/app/nav.tsx` and `apps/probono/dashboard/app/this-week/`.

Those files/deltas were not copied, discarded or changed. This worktree does not include the unfinished This week feature. The redesign does not change `navItems`; a proper merge should retain that separate entry. **Do not copy the entire redesigned Header over the dirty live Header**, which would remove the pending navigation entry. Review/integrate that feature separately and retest header layout if adding another item.

## Original integration verification

The sorting follow-up below supersedes these original test counts; current full-suite result is 514 tests and 18 browser check groups.

Executed on the isolated worktree:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Final result: lint, TypeScript, 51 Vitest files / 504 tests, data validation and optimized Next.js production build passed. Data validation reports **0 errors and 79 existing editorial warnings** (including source-hash drift and records awaiting review). No data or validator changes were made. Node deprecation/experimental warnings and deliberate malformed-PDF test fixture warnings remain in the full log; they are not suppressed.

Test-first red/green cycles covered the editorial entry/search, multi-select filter group, source links, companion SVG, mobile utilities, disclosure focus return, theme keyboard operation and view-group semantics. The real browser caught a native-details blur/checkbox focus crash that jsdom did not; the synchronous blur-close mutation was removed and real label clicks pass.

Run the built app only on a free loopback port:

```sh
npm run start -- --hostname 127.0.0.1 --port 8894
# In a second terminal:
POLICAI_EVIDENCE_DIR=/home/l0cka/Reports/2026-09-22-policai-editorial-index \
AXE_CORE_PATH=/home/l0cka/.hermes/cache/scratch/policai-editorial-a11y/node_modules/axe-core/axe.min.js \
node scripts/verify-editorial.mjs
```

`playwright-core` is already a root dev dependency; the script uses `/usr/bin/chromium` by default. The optional axe package was installed outside the checkout for verification, with no manifest/lockfile changes. To reproduce after scratch expiry, install `axe-core` in a separate scratch prefix and set `AXE_CORE_PATH` accordingly. Do not run this test against production: the script rejects non-loopback hosts.

Browser result: **12 check groups passed, zero page errors**. Tests cover public API/rendered totals, verified-only records, live search/empty/reset, multi-select combined filters, chips, Escape, all table sort columns, pagination/reset, source/detail navigation, main/explore routes, theme persistence and keyboard operation. Light/dark layouts at 320, 390, 768, 1024 and 1440px have no horizontal page overflow, with search in the first viewport. Nine rendered states were sampled with axe (WCAG 2 A/AA and 2.1 AA tags): **zero reported violations**. This is basic automated accessibility testing, not a WCAG certification. Contrast remains inconclusive on animated underline backgrounds and content intentionally covered by open overlays; the exact incomplete targets are retained in JSON. Core body/muted/link contrast calculations all exceed 4.5:1; lowest is 5.43:1. Screenshots were visually inspected. Reduced-motion capture settles the existing JavaScript count-up counters rather than capturing zero mid-animation.

Evidence directory: `/home/l0cka/Reports/2026-09-22-policai-editorial-index/`

- `check.log`, `verification.json`, `contrast.json`
- `desktop-light.png`, `desktop-dark.png`
- `mobile-light.png`, `mobile-dark.png`
- `mobile-navigation.png`, `mobile-filters.png`
- `record-detail.png`, `developments.png`, `courts.png`

## Sorting review follow-up

The independent review found two regressions: including sorting in the `PolicyTable` key remounted the focused header, and three descending dropdown options were missing. Both are fixed without design or data changes. Sorting now resets table pagination through guarded local state adjustment instead of remounting the table. The key still includes search and filter state, preserving their first-page reset. The dropdown represents all five fields in both directions.

Test-first evidence is retained separately from the original integration run:

- `sort-focus-red.log`: 1 failure / 4 passes; the focused header became BODY. `sort-focus-green.log`: 5 passes.
- `sort-sync-red.log`: the three affected fields failed with `effectiveDate:desc` instead of the requested descending value. `sort-sync-green.log`: all 14 browser-component tests pass.
- `sort-fixes-check.log`: full `npm run check` passed — 51 files / **514 tests**, lint, TypeScript, validation (0 errors / 79 existing warnings), production build.
- `sort-fixes-browser/verification.json`: real Chromium against that production build on isolated loopback port 8896 — **18 check groups**, zero page errors, nine axe states with zero reported violations (nine incomplete rule results retained). Ten screenshots saved; `table-sorting.png` visually confirms the focus ring and matching oldest-date selection/ascending header.

The enhanced browser script checks all five columns with dropdown ascending/descending selections, four consecutive Enter/Space toggles without refocusing, header sorting from page two, dropdown/header synchronization, first-page row IDs against API records, and search plus each filter group's page reset. It also retains the original responsive/theme/navigation coverage. Reproduce with `POLICAI_VERIFY_URL=http://127.0.0.1:8896` and `POLICAI_EVIDENCE_DIR=/home/l0cka/Reports/2026-09-22-policai-editorial-index/sort-fixes-browser` after starting a new isolated production preview. The verification preview was stopped; a connection probe confirmed 8896 closed. No live checkout, service, data/AI semantics, commit, push or deployment changes were made.

Status remains **REVIEW**, for coordinator verification; no remaining sorting blockers were observed.

## Integration and deployment (not executed)

1. Independently review this worktree and the evidence, including every untracked test/script/document. `git diff --check` must pass. Do not stage unrelated files in another checkout.
2. Obtain authority before committing/publishing. Preserve the unrelated pending This week and A2J work with its owner; do not reset, clean, stash or overwrite it opportunistically. Use a reviewed commit/merge from this isolated branch rather than file-copying into the deployed checkout. Main contains the existing AI transport; do not replace that base with an older checkout.
3. Before any authorised push, inspect the current deployment timer (`systemctl status policai-pull.timer policai-pull.service`) because pushing a production-tracked branch may trigger deployment. Fetch the actual published head only as part of authorised integration, reconcile any daily data commits, and rerun `npm run check` plus the browser verification on the exact merged tree. Never force-push. Handle any Header conflict by preserving the approved navigation destinations.
4. Deployment/restarts require Daniel's separate explicit approval. Follow the current Argus contract and Policai deployment guide. The current compatibility wrapper is `/home/l0cka/.local/bin/policai-deploy.sh` **with no arguments**; it delegates to the reviewed system `policai-pull.service` oneshot. It is not a bare Git pull. Do not bypass a sudo/approval refusal or persistent deploy gate. A wrapper timeout does not cancel the service: inspect it before retrying.
5. For that separately approved release, run the required topology preflight/postflight, inspect the deployment service's recorded health result, then verify the actual served root/detail/developments/courts pages and A2J sibling health. Keep rollback tied to the previously deployed commit and the existing deployment mechanism. No service, timer, network or live checkout change is part of this handoff.
