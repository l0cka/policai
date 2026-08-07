# Policai Observatory landing page — design QA

## Evidence

- Source visual truth: `/Users/l0cka/Projects/policai/docs/design/policai-landing-observatory-concept.png`
- Browser-rendered implementation: `/private/tmp/policai-observatory-implementation-final.png`
- Full-view comparison: `/private/tmp/policai-observatory-comparison-final.png`
- Focused hero comparison: `/private/tmp/policai-observatory-comparison-hero-final.png`
- Full-width chart implementation: `/private/tmp/policai-observatory-fullwidth-chart.jpg`
- Full-width chart comparison: `/private/tmp/policai-observatory-fullwidth-comparison.png`
- Focused full-width chart comparison: `/private/tmp/policai-observatory-fullwidth-focus.png`
- Route and state: `/`, dark Observatory landing page, empty search, top of page
- Source pixels: 1536 × 1024 at 1× density
- Browser CSS viewport and capture: 1579 × 1301 at 1× density
- Normalized comparison: implementation was centre-cropped to the source content region at 1536 × 1024; no scaling was applied to the full-view comparison
- Focused comparison: source hero 1536 × 607; implementation hero content crop normalized to 1536 × 607

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: Public Sans matches the source's civic sans-serif display and interface treatment. Heading scale, weight, line height, monospace labels, and information hierarchy are visibly aligned. No broken wrapping or truncation appears in the compared state.
- Spacing and layout rhythm: the header/status strip, 36/64 hero split, vertical divider, search/CTA grouping, four-metric rail, policy field, and three-column recent activity band follow the source composition. Borders and surfaces remain square and restrained.
- Colors and tokens: navy ground, blue navigation/accent treatment, mint live status, amber amendments, and muted white rules map closely to the source with sufficient contrast.
- Image quality and asset fidelity: the existing Policai logo asset is used and remains sharp. The policy field is a functional visualization of source-linked records, not decorative replacement art. No placeholder imagery, custom SVG, inline SVG, emoji, or CSS illustration substitutes are present.
- Copy and content: the source headline and explanatory copy are retained. Counts, jurisdiction totals, freshness, recent developments, and plotted dates come from the real register.
- Icons and affordances: existing Lucide interface icons match the installed product icon family and are consistently sized. Search, navigation, source links, policy points, view toggles, and filter controls remain interactive and keyboard reachable.
- Responsiveness and accessibility: the composition preserves the selected two-column structure at desktop/tablet widths and stacks below the existing responsive breakpoint. Search has a visible label for assistive technology, the policy points are named links, and focus styles remain inherited from the design system.

## Intentional product-data differences

- The source concept spreads points across April 2025–July 2026. The implementation plots each policy's real primary date, so the axis spans November 2019–August 2026 and recent records cluster toward the right. This preserves Policai's provenance standard and is accepted rather than falsifying dates for visual evenness.
- The recent activity titles reflect the current verified feed, so the second and third cards differ from the static concept.

## Comparison history

### Pass 1 — blocked

- [P1] The initial serif/italic hero heading departed from the selected bold sans-serif direction.
- [P1] The initial policy field used abbreviated jurisdictions and policy-type colors rather than full labels, counts, and policy-status encoding.
- [P1] The initial recent-activity section used a cream surface instead of continuing the dark Observatory field.
- Fixes: matched the source headline and Public Sans treatment; added full jurisdiction labels/counts and the source status legend; restored the dark recent-activity band; separated the search field and primary CTA; added the fourth source metric.
- Post-fix evidence: `/private/tmp/policai-observatory-implementation-pass2-top.jpg`.

### Pass 2 — blocked

- [P2] The masthead placed the data line above navigation and was about 31 px shorter than the source, shifting the main composition upward.
- Fixes: reordered the Observatory masthead, matched the two-row height, added live collector health and source-health access, and moved API/Feedback into the primary row.
- Post-fix evidence: `/private/tmp/policai-observatory-implementation-pass3.jpg` and `/private/tmp/policai-observatory-comparison-final.png`.

### Pass 3 — passed

- Full-view and focused comparisons show no remaining actionable P0/P1/P2 mismatch.
- Primary interactions tested in the in-app browser: searching for `recruitment` returned `1 policy matching “recruitment”`; clearing the search restored the register; `View developments` resolves to `/developments`.
- Final browser reload produced no new console errors. The earlier policy-point hydration mismatch was removed by using a stable collection timestamp and deterministic positioning.

### Pass 4 — annotation update, passed

- [P2] The policy-field figure used its intrinsic width inside a flex row, leaving a large unused area on the right of the selected chart container.
- Fix: added `w-full flex-1` to the figure and `w-full` to its chart wrapper in `src/components/policy-observatory.tsx`.
- Post-fix browser evidence: the figure spans 875.04 px inside the padded 911.61 px parent and its right edge matches the parent's right edge within 0.001 px.
- Visual evidence: `/private/tmp/policai-observatory-fullwidth-comparison.png` and `/private/tmp/policai-observatory-fullwidth-focus.png`.
- Verification: `npm run lint` and `npm run typecheck` both pass.

## Follow-up polish

- None required for handoff. The sparse early portion of the real policy timeline is intentional and should not be cosmetically redistributed.

final result: passed
