# Policai network relationship explorer — concept 02

Status: approved for implementation on 26 July 2026.

Approval response: “Yes I approve.”

## Approved concept set

1. `policai-network-concept-02-desktop.png`
2. `policai-network-concept-02-mobile-portrait.png`
3. `policai-network-concept-02-mobile-landscape.png`

The images govern composition and evidence hierarchy. They are not production
assets: graph marks, labels, counts, controls, source notes and relationship
explanations remain editable and data-bound in the application.

## Evidence lock

- Purpose: help readers explore thematic and formal relationships among
  verified Australian AI policy records.
- Insight title: “Where Australian AI policy converges.”
- Current takeaway: court guidance forms the clearest cross-jurisdiction
  thematic cluster.
- Current snapshot: 52 policies, 35 with inferred thematic connections,
  17 without inferred thematic connections and 12 cross-jurisdiction thematic
  links.
- Method caveat: thematic relationships are inferred from shared editorial
  themes using deterministic rules. They do not imply legal authority,
  dependency or endorsement.
- Formal relationships, such as supersession, are separate from inferred
  thematic relationships and use directed edges.
- Public policy records and source links remain the canonical evidence.

Counts and the current takeaway must be derived from the canonical dataset at
render time. If the data changes, the page must not preserve stale concept
values merely to match the raster.

## Locked elements

- Policai’s existing editorial civic-data shell, typography and provenance
  language.
- Warm paper surface, navy ink, cobalt selection, eucalyptus neighbours,
  amber formal relationships and neutral slate context.
- Insight and method caveat before the visualization.
- Overview-plus-focus network with a committed selected neighbourhood.
- Direct labels for the selected record and strongest neighbours.
- An embedded edge key and explicit zoom, fit-selection and reset paths.
- A persistent “why these policies connect” inspector showing shared themes,
  relationship kind, verification and source actions.
- Search, theme, jurisdiction and relationship-type filtering.
- Shareable URL-backed selection and filters.
- Desktop split workspace, mobile portrait focus view with a partial bottom
  inspector and mobile landscape split inspection workspace.
- Tap/focus as the mobile replacement for hover; no drag-only required action.
- A keyboard and screen-reader relationship-list path.
- Stable final-state rendering for reduced motion and static screenshots.

## Flexible elements

- Exact spacing, breakpoint values and final control density.
- The number of context labels visible at a given viewport.
- Renderer-specific force strengths, collision padding and label offsets.
- Compact wording required to prevent label collisions.
- Exact URL parameter names, provided committed state remains shareable and
  browser back/forward restores it.

## Interaction contract

- Default: a deterministic focused neighbourhood around a strong connected
  policy, with the broader network retained as quiet context.
- Hover: temporary preview only on devices that support it.
- Click, tap, Enter or Space: commit selection and synchronize the inspector,
  relationship list and URL.
- Focus/overview toggle: change density without changing relationship meaning.
- Filters: retain an active-state summary and provide Apply, Reset and close
  paths that return focus to the visualization.
- Zoom: explicit controls and fit-selection are always available. Touch users
  retain normal one-finger page scrolling and use explicit controls or a
  two-finger gesture for graph zoom.
- Empty surface: clear transient preview; committed selection remains until
  explicitly reset or replaced.
- Reduced motion: calculate a stable final layout without animated settling.

## Responsive contract

### Desktop

- Editorial introduction and four derived metrics precede the workspace.
- The graph owns the majority of the width.
- The selected-policy inspector remains visible at the right.
- The method caveat remains visible with the graph.

### Mobile portrait

- The insight, caveat and focused graph appear before secondary settings.
- Search and filters use compact controls; filters open in a described sheet.
- The selected-policy inspector behaves as a partial bottom panel and leaves
  the main graph visible.
- Targets are at least 44 CSS pixels where practical.
- Opening or closing search and filters restores the graph as the primary
  surface.

### Mobile landscape

- A compact insight/method bar replaces the large introduction.
- The graph and collapsible inspector use a split workspace.
- The caveat remains visible despite the reduced height.
- Landscape is an expanded inspection option, not a required orientation.

## Accessibility and resilience

- The SVG has a title, long description and selected-state summary.
- Important labels, filters, active state, caveat and counts do not depend on
  hover or colour alone.
- Nodes expose keyboard selection and enlarged pointer hit regions.
- A synchronized relationship list provides a non-spatial exploration path.
- The page is statically backed by repository data; it does not blank the
  last-known-good graph during a transient client or connection failure.
- Print and static screenshots preserve the insight, selected neighbourhood
  and caveat.

## Implementation QA

- Unit tests cover edge semantics, shared-theme explanations, formal
  relationships, derived metrics and URL-state parsing.
- Component/browser checks cover search, filters, selection, inspector
  synchronization, copy-link, keyboard access, reset and reduced motion.
- Visual QA covers desktop, mobile portrait and mobile landscape in light and
  dark system themes.
- Labels, panels and graph marks are checked for clipping and overlap.
- `npm run check` is the final repository gate.
