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

### Pass 5 — deframe (both tabs still felt squashed)

- The explorer card frame was removed entirely. Both tabs are open spreads on
  the page: the kicker/tab header row closes with a print rule, the map and
  the System diagram sit directly on the page background, and the detail
  column is separated by a vertical rule with hairlines between its sections
  instead of a card.
- The System diagram lost its second frame (`.diagram-frame` border, card
  background and padding are neutralised inside the explorer) and now uses
  the full 1536 px container width.
- The duplicated "Explore by jurisdiction." hero intro line was removed; the
  explorer's own kicker carries it.
- The "National Pro Bono Target" caption in the System diagram overlapped the
  NAJP node's right edge; it moved below the node into clear space beside the
  dashed pro bono flow it annotates.
- Both captures above were retaken after this pass (dark, 1530 px).

### Pass 6 — category split and state zoom

- "CLCs + Women's Legal Services" split into two explorer categories.
  Women's legal services sit inside the CLC tier in every source directory,
  so the split is derived from each organisation's own name
  (`isWomensLegalService` in `lib/sector-data.ts`; 19 of 157 CLC-tier
  records). The underlying tier and the System diagram's combined
  "154 represented" node are unchanged — that figure is sourced to CLCs
  Australia describing both groups together.
- Women's Legal Services get a rose key dot; map counts, density shading,
  the scale row and the detail column all recount under the new category.
- Map zoom: an Australia / selected-state toggle above the map, and a second
  click on the selected state, zoom into that state's boundary (animated CSS
  transform, capped at 6×). Clicking another state while zoomed re-zooms to
  it. Labels, counts, halos, the ACT leader and the selection hatch
  counter-scale so they hold a constant on-screen size at any zoom level.
- Limit stated for the record: the directory has no address or coordinate
  data, so precise service locations cannot be plotted honestly yet.
  Geocoding the directory is the follow-up that would enable point-level
  coverage analysis; the map keeps its "counts are directory records, not
  service locations" caveat.
- The map capture above was retaken after this pass (Women's Legal Services
  filter, Australia view).

### Pass 7 — office location pins

- `dashboard/lib/sector-locations.json` records the primary-office location
  of 173 of the 177 frontline organisations. Addresses were compiled from
  each organisation's own website or its peak body's directory (a source URL
  is stored per record; nothing was guessed), then geocoded with
  OpenStreetMap Nominatim under state-boundary sanity checks. 151 records
  are street-precision; 22 are suburb-level (the organisation publishes only
  a PO Box). The 4 unresolved organisations are listed in the file with the
  reason each address could not be verified — one deliberately publishes no
  address as a family-violence service.
- The map renders every located organisation in the current category scope
  as a category-coloured pin inside the zoom transform: constant on-screen
  size at any zoom, hollow for suburb-level records, dimmed outside the
  selected jurisdiction, co-located pins fanned on a small ring, and a
  hover tooltip naming the organisation. Selecting a pin opens that
  organisation's record in the detail column; the accessible path to the
  same records remains the picker, so the pin layer is aria-hidden.
- The map footer discloses the compilation method and OSM attribution.
- Fixed during this pass: an SVG title hydration mismatch from multiple
  adjacent text expressions.
- The map capture above was retaken (Victoria zoom, CLC pins, Allied
  Justice selected from its Ballarat pin).

### Pass 8 — continuous zoom and progressive detail

- Free zoom to 24×: pinch or ⌘/ctrl-scroll (anchored under the pointer;
  plain scrolling still scrolls the page), double-click to zoom in, drag to
  pan, − / + buttons, and the existing Australia / state-fit shortcuts. Fit
  and reset actions ease; pointer-driven zooming and panning suppress the
  transition so the map tracks the hand. Drag movement suppresses the
  click that would otherwise change the selection.
- Progressive detail: past 3× the map swaps in high-resolution ABS
  coastlines (scripts/build-sector-map-detail.mjs, maxAllowableOffset
  0.005°, lazy-loaded 252 KB chunk that never enters the base bundle);
  past 8× pins name themselves, decluttered by a nearest-neighbour rule
  (~18 px clearance) so metro clusters stay clean until the zoom separates
  them; jurisdiction codes fade back at 10×; and a km scale bar
  (≈, computed at the view-centre latitude) updates continuously.
- The second-click-to-zoom shortcut on the selected state was removed —
  it conflicted with double-click zoom and the free-zoom model.
- The map capture above was retaken (~50 km scale over Port Phillip,
  decluttered labels, high-detail coastline).

### Pass 9 — real slippy map (street-level detail, no shading)

- The custom SVG map was replaced by MapLibre GL over OpenFreeMap vector
  tiles (dark style in dark theme, Positron in light; no API key). The map
  now zooms to true street level with native pan/zoom/inertia, pinch or
  ⌘-scroll (cooperative gestures keep plain scrolling on the page), and
  built-in label collision. Choropleth shading and the selection hatch are
  gone; the selected state is a boundary outline only, per feedback.
- Clustering replaced the co-located pin fan-out that had pushed CBD
  organisations visually into Port Phillip Bay (a ~15 km artificial ring
  offset — the placement fault reported). Numbered cluster badges expand as
  the zoom separates members; faded pins mark suburb-level geocodes.
- Layout: full-width map (up to 74vh) with the detail column floating over
  the right edge like a map application's side panel; it drops below the map
  under 960 px. Jurisdiction code + count chips are HTML markers in the
  site's monospace face, hidden past ~6.5×; ABS state boundaries ship as
  public/data/australia-states.geojson (scripts/build-sector-geo.mjs) with
  per-state bboxes for the Australia/state fit buttons.
- Attribution: OpenFreeMap © OpenMapTiles, © OpenStreetMap contributors,
  ABS ASGS 2021, in the map's attribution control.
- Verified at runtime: style + tiles + sprites load, overlays and cluster
  sources attach, markers place, console clean. Final visual pass pended in
  this session only because the browser tab was backgrounded (rAF paused);
  the SVG passes 1–8 remain documented above for history.

### Pass 10 — blank-canvas root cause: the bundled worker

- The blank map was not a tab-visibility artifact. MapLibre's web worker,
  when bundled into the Next chunk graph, crashed silently on startup:
  workers received messages and never replied (17 pending actor requests,
  zero responses), so every source stalled and the style never completed —
  with no error surfaced anywhere.
- Fix: the worker loads as a plain served file. predev/prebuild copy
  maplibre-gl-worker.mjs and its self-contained shared chunk into
  public/maplibre/ (gitignored), and the map view calls
  `maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')`.
- Verified live with the tab visible: style and 16+ vector tiles load,
  basemap renders with place labels, cluster badges split on click through
  country → state → regional zoom (500 km → 50 km scales observed), the
  selected-state outline and pins draw, and the attribution control shows
  OpenFreeMap/OpenMapTiles/OSM/ABS.
- A deferred-init gate from the visibility investigation was kept: the map
  is only created once its container is visible, which remains the correct
  behaviour for background-tab loads.

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
