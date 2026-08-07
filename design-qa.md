# Design QA — Policai A2J observatory redesign

## Comparison target

- Source visual truth: `docs/design/policai-observatory-reference-current.jpg`
- Rendered implementation: `docs/design/probono-radar-observatory-implementation.jpg`
- Source URL/state: Policai home, dark theme, default route
- Implementation URL/state: Pro Bono Radar home, dark theme, default route with local fixture data
- Viewport: 1579 x 1301 CSS px
- Source pixels: 1579 x 1301
- Implementation pixels: 1579 x 1301
- Device density: 1x for both captures; no density normalization required
- Browser: Codex in-app browser

## Full-view comparison evidence

The source and implementation were opened together in one same-viewport comparison input. The final implementation preserves the source hierarchy and proportions: civic masthead, live data strip, split observatory hero, left search/actions/metrics, right time field, recent-change band, and the source-linked register below.

The Radar intentionally substitutes its own product vocabulary and real data model: stream rows replace jurisdictions, signals/opportunities replace policy statuses, and the Radar feed replaces the policy register.

## Focused region evidence

A separate crop was not needed. At 1579 x 1301 the full captures keep the masthead, hero typography, search controls, chart labels/points, recent-signal cards and register transition legible at native density. The primary search and the Deadlines navigation were additionally exercised in the browser.

## Findings

No actionable P0, P1 or P2 findings remain.

- Typography: Public Sans, IBM Plex Mono and Newsreader preserve the source's sans/mono/editorial hierarchy. The hero scale and wrapping were reduced during QA to restore the source's above-the-fold rhythm.
- Spacing and layout: the split grid, divider, hero depth and recent-signal transition now track the source proportions. The responsive rules retain stacked hero/chart and full-width controls below 720 px.
- Colors and tokens: navy civic surfaces, mint live states, periwinkle labels/actions and restrained hairline rules map directly to the Policai palette.
- Image and asset fidelity: the reference is a data-led interface with no hero imagery. No placeholder imagery was introduced; the Radar field uses live application data and the existing product mark/icon set.
- Copy and content: all permanent copy is specific to Australian access to justice, while feed titles, counts, statuses and sources remain database-driven.
- Accessibility and behavior: semantic headings, labelled search fields, keyboard focus styles, reduced-motion rules, source link safety and native buttons/links are retained. Search resolved to `/?q=digitisation#radar-feed`; the primary Deadlines link resolved to `/deadlines`.
- Browser diagnostics: the final clean preview produced no console errors. `npm run build` passed after the final visual changes.

## Comparison history

### Pass 1

- [P2] The chart omitted five fixture records with no stream classification, so the field showed 1 signal while the hero metric showed 6.
- Fix: added a conditional Unclassified row and plotted all source-linked signals.
- Post-fix evidence: the field count now reconciles to the six tracked signals and all records remain available as interactive points.

### Pass 2

- [P2] The initial hero was taller and the left/right split sat farther right than the Policai source, changing above-the-fold density.
- Fix: reduced desktop headline scale and hero padding, and tightened the grid ratio/gap.
- Post-fix evidence: the recent-change band and register transition now enter the same viewport while preserving the Policai composition.

### Pass 3

- No P0/P1/P2 differences remained. The final screenshot was captured after the clean production build and preview restart.

## Implementation checklist

- [x] Preserve real Radar data and existing routes.
- [x] Match Policai masthead, live strip, hero hierarchy and recent-change band.
- [x] Make the hero chart source-linked and data-driven.
- [x] Verify search and Deadlines navigation.
- [x] Pass production build and clean browser diagnostics.

## Follow-up polish

- [P3] Production data should naturally improve field density as enriched items fill the four named streams; the Unclassified row is intentionally retained as an honest fallback.

final result: passed
