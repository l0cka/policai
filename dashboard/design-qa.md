# Design QA — homepage hero annotation

## Comparison target

- Source visual truth: user annotation on the production homepage, captured at `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/homepage-hero-production-reference.png`.
- Rendered implementation: `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/homepage-hero-updated-desktop.png`.
- Combined comparison: `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/homepage-hero-before-after.png`.
- Mobile implementation: `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/homepage-hero-updated-mobile.png`.
- Desktop viewport: 1647 x 1552 CSS px; both captures are 1632 x 1538 pixels at density 1.
- Mobile viewport: 390 x 844 CSS px.
- State: live homepage data, dark theme, feed hero.
- Browser: Codex in-app browser.

## Full-view comparison evidence

The implementation preserves the hero grid, introduction, search, actions, statistics, signal network and recent-items region. The requested copy and scale change reduces the heading from 72 px to 56 px and the removed opportunity card allows the graph summary to sit directly beneath the visualization.

## Focused region evidence

The hero heading measures 56 px with a 57.12 px line height at the annotated desktop viewport and wraps across three lines without clipping. The featured opportunity selector has zero rendered instances. The summary begins 4 px below the graph, so the removed card leaves no dead space.

## Findings

No actionable P0, P1 or P2 findings remain.

- Typography: IBM Plex Mono, weight, tracking and 1.02 line height are preserved; desktop maximum is 56 px. Mobile follows the existing fluid rule and measures 46.8 px at 390 px width.
- Spacing and layout: all existing grid tracks and region spacing remain; removing the card closes its occupied space naturally.
- Colors and tokens: unchanged.
- Image and asset fidelity: the live SVG signal network is unchanged; no image or icon assets were added or replaced.
- Copy and content: heading is `Monitor access to justice developments.`; the featured opportunity card and its link are removed.
- Responsive behavior: 390 x 844 CSS px has no page-level horizontal overflow and the heading remains fully visible.

## Comparison history

### Pass 1

- Passed: the requested 56 px desktop size is exact, the new copy wraps cleanly, the card is absent, and desktop/mobile have no horizontal overflow.

## Above-the-fold copy diff

- `See access to justice as it changes.` became `Monitor access to justice developments.`
- Removed the dynamic featured opportunity/latest card under the signal network.

## Intentional deviations

- The 56 px requirement is the desktop cap. The existing mobile breakpoint remains fluid and resolves to 46.8 px at a 390 px viewport to prevent overflow.

final result: passed
