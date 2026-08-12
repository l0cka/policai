# Design QA — aligned map legend

## Comparison target

- Source visual truth: user annotation on the left `How to read this map` panel, captured in `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/sector-map-guide-height-final.png`.
- Rendered implementation: `/Users/l0cka/.codex/visualizations/2026/08/11/019ff2f0-22f9-7253-aa2e-9fd0b865b782/sector-map-legend-aligned-final.png`.
- Desktop viewport: 1742 x 1552 CSS px; capture: 1727 x 1539 pixels; browser density-normalized capture.
- Mobile viewport: 390 x 844 CSS px.
- State: Map / VIC / Community Legal Centres / Inner Melbourne Community Legal.
- Browser: Codex in-app browser.

## Full-view comparison evidence

The revised rail and map canvas share the same 800 px height and the same top and bottom edges. The explanatory block is now visually recognizable as a legend rather than a prose note.

## Focused region evidence

The focused left rail shows four distinct legend marks: the active category office dot, a numbered cluster badge, a map-location icon for the selected jurisdiction and a muted map-pin-off icon for coverage that is not represented. The dot and cluster match the live map palette and geometry; Lucide provides the two semantic icons.

## Findings

No actionable P0, P1 or P2 findings remain.

- Typography: existing mono family, weights and label hierarchy are preserved; legend terms remain scannable at the narrow rail width.
- Spacing and layout: rail and map are exactly 800 px high at the desktop test viewport. The guide content ends 1 px above the inner edge with no clipping or internal scrolling.
- Colors and tokens: office and cluster marks reuse active category, card, trust, foreground and muted tokens.
- Image and icon fidelity: Lucide React supplies the semantic map icons; the office and cluster samples reproduce the actual MapLibre layer symbols.
- Copy and content: all four map-reading concepts remain, with shorter labels and descriptions suitable for a legend.
- Responsive behavior: the 390 x 844 CSS px check has no horizontal overflow and no guide clipping.

## Comparison history

### Pass 1

- [P2] Natural content height left the rail 22.48 px below the 800 px map.
- Fix: tied the desktop rail to the same responsive height expression as the map and allowed the guide to occupy the remaining space.

### Pass 2

- [P2] The guide content itself exceeded the aligned rail by 21.48 px.
- Fix: tightened only the legend's internal vertical rhythm while retaining 1.45 line height.

### Pass 3

- Passed: rail and map both measure exactly 800 px; guide ends 1 px inside the rail; no clipping, scrolling or horizontal overflow.

## Above-the-fold copy diff

- `How to read this map` became `Map legend`.
- `Primary offices`, `Clusters`, `Outlined state` and `Not shown` became concise singular legend labels with their meaning preserved.

## Intentional deviations

The map dot and cluster are direct visual samples rather than library icons because they intentionally reproduce the symbols rendered by MapLibre. The map-location and excluded-coverage symbols use Lucide React.

final result: passed
