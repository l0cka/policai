# Design QA — Jurisdiction Lens sector explorer

## Comparison inputs

- Source visual: left-hand pane of `docs/design/sector-jurisdiction-map-comparison.png`
- Implementation capture: `docs/design/sector-jurisdiction-map-implementation.png`
- Combined full-view comparison: `docs/design/sector-jurisdiction-map-comparison.png`
- Focused System capture: `docs/design/sector-system-implementation.png`
- Source pixels: 1487 × 1058
- Implementation pixels: 1483 × 1059
- State: dark theme, Map tab, Victoria, CLCs + Women’s Legal Services, Secondment, Inner Melbourne Community Legal

## Iteration history

### Pass 1

- P2 layout: the existing page introduction and statistic strip pushed the primary explorer too far below the fold compared with the source visual. Fixed by promoting “Funding and referral structure” to the page hero and moving the statistic strip below the explorer.
- P2 layout: the desktop explorer was taller than the source and hid too much of the map at the comparison viewport. Fixed with a bounded desktop explorer and internally scrollable filter/detail columns; tablet and mobile return to natural height.
- P2 typography: the Family Violence Prevention Legal Services, CLC peak-body and pro bono coordination labels overflowed their System nodes. Fixed with compact label styles and shorter sourced wording.

### Pass 2

- Full-view source/implementation comparison checked for hierarchy, spacing, type, color, surface treatment, map prominence and the Map/System control.
- System view checked for node alignment, connector legibility, label containment and visible Australian Government/private-profession distinction.
- No unresolved P0, P1 or P2 fidelity findings.

## Functionality and accessibility

- Map and System tabs switch panels.
- Selecting the CLC + Women’s Legal Services node in System returns to the filtered Map view.
- Jurisdiction selection updates counts, organisation options and detail content.
- Secondment selection surfaces sourced examples for Inner Melbourne Community Legal and Kingsford Legal Centre.
- State shapes and System delivery nodes support Enter and Space activation.
- Semantic tabs, tab panels, buttons, labels, source links and visible focus states are present.
- Desktop, tablet and 453 px mobile layouts were checked; the mobile view has no horizontal page overflow and places the map before filters.
- Final clean-browser console check: no errors or warnings.
- Production build and `git diff --check`: passed.

final result: passed
