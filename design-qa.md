# Design QA — source → signal → collection network

## Comparison target

- Source visual truth: `docs/design/probono-radar-signal-network-option-2.png`
- Rendered implementation: `docs/design/probono-radar-signal-network-implementation.png`
- Full-view comparison: `docs/design/probono-radar-signal-network-comparison.png`
- Focused network comparison: `docs/design/probono-radar-signal-network-focused-comparison.png`
- Mobile implementation: `docs/design/probono-radar-signal-network-mobile.png`
- Viewport: 1279 x 721 CSS px for the final desktop capture
- Source pixels: 1672 x 941
- Implementation pixels: 1487 x 837 raw capture; cropped to the 1279 x 721 CSS viewport and normalized to 1672 x 941 for comparison
- Device density: browser-reported 0.86 for the normalized desktop capture
- State: dark theme, default route, local fixture database
- Browser: Codex in-app browser

## Full-view comparison evidence

The approved mock and normalized implementation were combined into one same-state comparison image. The implementation preserves the existing site shell and left hero while replacing only the right panel. It matches the approved left-to-right reading path, title, legend, source nodes, central signal column, curved provenance links, collection hubs, inline selected-signal annotation and five-part summary strip.

The visible density differs intentionally: the approved mock illustrates 30 representative signals from five sources, while the local fixture database contains six current signals from two sources. The component selects up to 30 real rows from the five most active sources and therefore reaches the approved density automatically on production data without inventing records.

## Focused region evidence

The right-hand data panels were also cropped and compared together at native normalized scale. Node roles, restrained edge treatment, mint signal encoding, amber opportunity ring, periwinkle collection hubs, direct labels and the selected-signal annotation all retain the approved visual hierarchy. Fixture data contains no opportunities, so the local comparison correctly shows zero amber signal nodes while retaining the legend encoding.

## Findings

No actionable P0, P1 or P2 findings remain.

- Typography: the existing Public Sans and IBM Plex Mono hierarchy is preserved; labels and counts remain readable at desktop scale and match the approved editorial/technical contrast.
- Spacing and layout: the network fills the right hero panel, retains the vertical divider and summary baseline, and does not change the left hero or downstream sections.
- Colors and tokens: source, signal, opportunity and collection roles use the approved mint, amber and periwinkle palette on the existing navy surface. Role shape and labels make color non-essential.
- Image and asset fidelity: the target is a live data visualization rather than a raster asset. The implementation recreates its semantic geometry with server-rendered SVG and real records; no placeholder art or decorative imagery was introduced.
- Copy and content: the approved title, 30-day scope and role names are retained. Labels, counts, titles, dates and URLs are database-driven.
- Accessibility and behavior: the figure has a text summary and hidden relationship list; all real source, signal and collection nodes are links; signal hit areas are enlarged; keyboard focus mirrors hover; mobile uses a labelled horizontal focus view with a visible scroll instruction.
- Browser diagnostics: signal, source and collection links were present and correctly labelled; the internal collection link resolved to `/?stream=tech_justice#radar-feed`; no console warnings or errors were recorded.

## Comparison history

### Pass 1

- [P2] On mobile, the 30-day label competed with the network title and was clipped at the right edge.
- Fix: moved the range and legend into their own stacked rows and added a concise mobile scroll instruction.
- Post-fix evidence: `docs/design/probono-radar-signal-network-mobile.png` shows the title, range, legend and focus view without page-level horizontal overflow.

### Pass 2

- No P0/P1/P2 differences remained. Desktop and mobile captures were made after the responsive fix, with working node links and a clean browser console.

## Implementation checklist

- [x] Use real 30-day database rows and truthful aggregate counts.
- [x] Preserve source provenance and collection filters as working links.
- [x] Limit the hero to 30 representative signals for legibility.
- [x] Provide keyboard, screen-reader and mobile reading paths.
- [x] Match the approved Option 2 hierarchy and palette.

## Follow-up polish

- [P3] Production data will provide the dense five-source, multi-collection composition shown in the approved mock; the sparse local fixture state is intentionally honest.

final result: passed
