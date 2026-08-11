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

### Pass 3 — craft and coherence improvements

- The map is now a choropleth: state fill density tracks record counts under the
  active service-category filter, with a 0–max scale row under the map. Counts on
  the map recount when a category is selected, so the filter drives the map, not
  only the side panel.
- The selected state uses a print-style diagonal hatch instead of a flat fill, and
  state labels grew a paper-coloured halo (`paint-order: stroke`) so they stay
  legible across borders and hatching.
- The ACT label moved offshore on a leader line with an enlarged invisible hit
  target; Victoria's and Tasmania's anchors were nudged off their coastlines.
- Relationship filters show sourced-evidence counts for the current scope and dim
  when empty; the default organisation preference is evidenced, then monitored
  (the hard-coded Fitzroy Legal Service default was removed).
- The detail column names the jurisdiction in full, adds a previous/next record
  stepper with "n of m" positioning, marks radar status with a dot, and re-enters
  with a short reveal transition (reduced-motion safe).
- P1 layout: the bounded desktop explorer clipped Tasmania, the scale and the map
  source note (canvas content was 757 px in a 608 px track). The map SVG now
  flex-shrinks to the remaining column height on desktop and returns to natural
  aspect-ratio sizing below 1100 px.
- System view: the pro bono coordination caption no longer overflows its node and
  the FVPLS node was widened to contain its title.
- Implementation captures above were retaken after this pass (1490 px, dark).

### Pass 4 — layout restructure (squashed / hard to navigate feedback)

- The bounded three-column explorer was replaced with a two-pane spread at
  natural height: dominant map left, one detail column right, normal page
  scrolling, no hidden internal scrollbars.
- The duplicate left filter sidebar was removed. The service-category filter
  lives only in the detail column (with an "All frontline services" row), so
  there is a single reading order: state on the map, category, organisation.
- The relationship picker moved into the evidence section as chips with
  sourced-evidence counts, directly above the block it changes; the
  evidence-gating note sits under the evidence items.
- The rectangular keyboard-focus outline on states was replaced with a
  coastline-following ring stroke (`outline: none` on the group, thicker
  `--ring` stroke on the path for `:focus-visible`).
- Responsive: one stack breakpoint at 960 px (map above detail); the 760 px
  rules keep the stacked government context and compact canvas padding.
- Known pre-existing issue, out of scope: the site header's theme toggle
  overflows the viewport by ~3 px at in-between widths (~720 px).
- The map capture above was retaken after this pass; the System capture is
  unchanged from pass 3.

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
