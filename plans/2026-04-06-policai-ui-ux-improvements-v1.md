# Policai UI/UX Improvement Plan

## Objective

Elevate the UI/UX of the Policai Australian AI Policy Tracker to deliver a more polished, accessible, and cohesive experience across all views — improving discoverability, mobile responsiveness, visual consistency, and user engagement with policy data.

---

## Current State Assessment

### Strengths
- Clean, editorial design language (IBM Plex fonts, warm off-white palette)
- Consistent use of monospace uppercase labels for metadata
- Good use of color-coded status indicators (green/amber/blue/gray)
- Well-executed map interaction with animated sliding panel
- Keyboard accessibility on SVG map (`tabIndex`, Enter/Space handlers)
- `prefers-reduced-motion` support in map animations

### Identified Issues (Prioritized)

| Priority | Issue | Impact | Source |
|----------|-------|--------|--------|
| **P0** | Mobile breakage on map page — sliding panel is fixed 340px with no mobile adaptation | High | `src/app/map/page.tsx:105` |
| **P0** | Agencies sidebar is always visible with no responsive collapse — table is unusable on mobile | High | `src/app/agencies/page.tsx:46` |
| **P1** | Home page is a bare data table with no contextual introduction — new visitors have no orientation | High | `src/app/page.tsx:88-121` |
| **P1** | Three major feature pages (Framework, Network, Timeline) are fully built but hidden from navigation | High | `src/components/layout/Header.tsx:11-15` |
| **P1** | `STATUS_COLORS` map is duplicated independently across 4 files instead of being shared | Medium | `policy-detail-tabs.tsx:16-21`, `policy-table.tsx:26-31`, `map/page.tsx:18-23` |
| **P2** | No dark mode support — CSS variables only define light theme | Medium | `src/app/globals.css:47-80` |
| **P2** | Network page uses a different visual language (gradient cards, stat boxes) than the rest of the app | Medium | `src/app/network/page.tsx:76-93` |
| **P2** | Policy detail Content tab shows raw text with no formatting or empty state enhancement | Medium | `policy-detail-tabs.tsx:127-130` |
| **P2** | No loading states or skeleton placeholders during data fetching on client pages | Medium | Multiple pages |
| **P3** | Footer links to `/about` and `/methodology` which are non-existent pages | Low | `src/components/layout/Footer.tsx:10-12` |
| **P3** | GitHub link in footer points to generic `https://github.com` instead of the actual repo | Low | `src/components/layout/Footer.tsx:14-21` |
| **P3** | `BackToTop` component exists but is not used anywhere in the app | Low | `src/components/ui/back-to-top.tsx` |
| **P3** | Settings tab in admin has non-functional Save button (no `onClick` handler) | Low | `src/components/admin/SettingsTab.tsx` |

---

## Implementation Plan

### Phase 1: Critical Mobile & Layout Fixes

- [ ] **1.1 Make map page responsive.** On viewports below `md`, replace the 340px fixed sliding panel with a bottom sheet (full-width drawer sliding up from the bottom, approximately 60% viewport height). Use the existing `Sheet` component from shadcn/ui or a similar approach. The `AustraliaMap` should take full width on all screen sizes. The bottom summary bar should also become full-width and not attempt to adjust for a side panel on mobile.
  - Files: `src/app/map/page.tsx`
  - Rationale: The 340px panel overflows small screens entirely, making the map unusable on phones.

- [ ] **1.2 Make agencies page responsive.** Collapse the 240px sidebar into a horizontal filter bar (search + select inline) at viewports below `lg`. Convert the data table into a card-based layout on mobile where each agency is a tappable card showing name, acronym, and statement status — with expand-on-tap for details.
  - Files: `src/app/agencies/page.tsx`
  - Rationale: Sidebar + wide table is completely broken on small screens.

- [ ] **1.3 Make filter sidebar responsive on home page.** The `FilterSidebar` already has `w-full lg:w-60` but verify it collapses cleanly on mobile — consider rendering filters as a collapsible disclosure or horizontal pills below the search bar on small screens rather than a full-width block.
  - Files: `src/components/filter-sidebar.tsx`, `src/app/page.tsx`
  - Rationale: On mobile the sidebar takes full width above the table, pushing content down excessively.

### Phase 2: Navigation & Discoverability

- [ ] **2.1 Redesign navigation to surface hidden pages.** Add a secondary navigation tier or expand the header nav to include all key views. Recommended approach: keep the current 3-item primary nav (Policies, Map, Agencies) and add a "More" dropdown menu containing Framework, Network, and Timeline links. Alternatively, consider a 5-item nav (Policies, Map, Agencies, Framework, Timeline) — the Network page could be linked contextually from the Policies page rather than in the top nav.
  - Files: `src/components/layout/Header.tsx`
  - Rationale: Three fully-built feature pages are invisible to users, wasting significant development effort.

- [ ] **2.2 Add a hero/introduction section to the home page.** Above the filter+table layout, add a brief contextual block: a one-line tagline (e.g., "Tracking AI policy and regulation across Australia"), a row of key stats (total policies, jurisdictions covered, active policies count), and optionally a prominent link to the Map view. Keep it minimal — the editorial aesthetic should not be disrupted by a large marketing-style hero.
  - Files: `src/app/page.tsx`
  - Rationale: New visitors arriving at a bare data table have no context about what Policai is or why it matters.

- [ ] **2.3 Fix footer links.** Point the GitHub link to `https://github.com/danielalkurdi/policai`. For the About and Methodology links, either create minimal content pages or replace them with anchor sections on the home page. If creating pages is out of scope, change them to hash-link anchors to a brief section at the bottom of the home page.
  - Files: `src/components/layout/Footer.tsx`
  - Rationale: Broken links degrade trust and professionalism.

### Phase 3: Visual Consistency & Design System Hardening

- [ ] **3.1 Extract shared constants into a central design-tokens file.** Create a `src/lib/design-tokens.ts` file exporting `STATUS_COLORS`, `STATUS_BG_COLORS`, and any other repeated visual mappings. Update all 4+ files that currently define `STATUS_COLORS` independently to import from this central location.
  - Files: New `src/lib/design-tokens.ts`, then update `policy-detail-tabs.tsx`, `policy-table.tsx`, `map/page.tsx`, and any others
  - Rationale: Ensures visual consistency and makes future palette changes a single-point update.

- [ ] **3.2 Harmonize the Network page visual language.** Restyle the Network page's stat cards, Dialog content, and sidebar to use the same monospace-label, minimal-border, editorial aesthetic as the rest of the app. Replace gradient backgrounds with flat borders and muted backgrounds. Use the `FilterSidebar` pattern for network filters.
  - Files: `src/app/network/page.tsx`
  - Rationale: The Network page looks like it belongs to a different application compared to the Home, Map, and Agencies pages.

- [ ] **3.3 Add a dark mode theme.** Define a `:root.dark` or `@media (prefers-color-scheme: dark)` block in `globals.css` with appropriate dark variants of all CSS variables (background, foreground, card, muted, primary, border, etc.). Add a theme toggle button in the header using `next-themes` or a simple `localStorage`-based approach. Ensure all hardcoded color values (e.g., `hover:bg-[#f0efed]`, `text-green-700`, SVG fills) are replaced with CSS variable references or conditional Tailwind classes.
  - Files: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/Header.tsx`, multiple components with hardcoded colors
  - Rationale: No dark mode in 2026 is a significant UX gap; the warm off-white background is harsh in low-light environments. Note: This is a larger effort due to hardcoded color values scattered across components (map SVG fills, status colors, hover states).

### Phase 4: Micro-interactions & Polish

- [ ] **4.1 Add loading skeletons for client-side pages.** Create a `PolicyTableSkeleton` component with animated placeholder rows and a `FilterSidebarSkeleton`. Apply these as the initial render state on the home page and agencies page while data is being processed. For the map page, show a subtle pulse animation on the SVG container before data loads.
  - Files: New skeleton components in `src/components/ui/`, updates to `src/app/page.tsx`, `src/app/agencies/page.tsx`, `src/app/map/page.tsx`
  - Rationale: Currently, pages either flash empty or jump when data hydrates. Skeletons provide perceived performance.

- [ ] **4.2 Enhance the policy detail Content tab.** When `policy.content` exists, render it with basic typographic formatting (paragraph spacing, potential heading detection). When it's empty, show a more informative empty state with a link to the source URL and a note explaining that full content may not be available. Consider rendering AI-extracted key points as a bulleted summary.
  - Files: `src/app/policies/[id]/policy-detail-tabs.tsx`
  - Rationale: The Content tab currently shows either a wall of unstyled `whitespace-pre-wrap` text or a single dismissive line.

- [ ] **4.3 Integrate the `BackToTop` component.** Add `<BackToTop />` to the root layout or to long-scrolling pages (home, agencies, timeline, framework). Consider enhancing it with a fade-in/out animation instead of the current show/hide toggle.
  - Files: `src/app/layout.tsx` or individual page files, `src/components/ui/back-to-top.tsx`
  - Rationale: The component was built but never used. Long policy tables and the agencies list benefit from quick scroll-to-top.

- [ ] **4.4 Add subtle page transition animations.** Wrap page content in a fade-in animation on mount (using CSS `@keyframes` or a simple `opacity 0 → 1` transition on the `<main>` container). Keep it fast (200-300ms) and respect `prefers-reduced-motion`.
  - Files: `src/app/layout.tsx` or `src/app/globals.css`
  - Rationale: Page transitions currently feel abrupt. A minimal fade improves perceived smoothness without adding dependency weight.

- [ ] **4.5 Improve search UX with debouncing and keyboard shortcuts.** Add a 200ms debounce to the search inputs on the home page and agencies page to prevent excessive re-renders during fast typing. Add a keyboard shortcut (Cmd/Ctrl+K or `/`) to focus the main search input on the home page.
  - Files: `src/app/page.tsx`, `src/app/agencies/page.tsx`
  - Rationale: Power users benefit from keyboard navigation; debouncing prevents jank on large datasets.

### Phase 5: Enhanced Data Presentation

- [ ] **5.1 Add URL-synced filters.** Sync filter state (jurisdiction, type, status, search) to URL query parameters on the home page using `useSearchParams()`. This enables users to share filtered views via URL and preserves filter state on browser back/forward navigation.
  - Files: `src/app/page.tsx`
  - Rationale: Currently, all filter state is lost on navigation. Bookmarkable filtered views are essential for a reference tool.

- [ ] **5.2 Add pagination or virtualized scrolling to the policy table.** If the dataset grows beyond ~50 policies, the full-render table will degrade. Implement either client-side pagination (e.g., 25 per page with page controls) or virtual scrolling using a library like `@tanstack/react-virtual`.
  - Files: `src/components/policy-table.tsx`, `src/app/page.tsx`
  - Rationale: Proactive scalability — the scraper continuously adds new policies, and the table will eventually need bounded rendering.

- [ ] **5.3 Add an "empty state" illustration system.** Create a consistent empty-state pattern with an icon, message, and optional action button. Apply it to: policy table (no results), agencies table (no results), map panel (no policies), timeline (no events), and the related policies tab. Currently each page implements empty state differently (some just text, some with icons).
  - Files: New `src/components/ui/empty-state.tsx`, then update policy-table, agencies, map panel, timeline, policy-detail-tabs
  - Rationale: Consistent empty states improve polish and help users understand why no data is shown and what action to take.

- [ ] **5.4 Enhance the map tooltip with richer data.** Add policy type breakdown (e.g., "2 Legislation, 1 Guideline") and a "Click to explore" call-to-action to the cursor-following tooltip on the Australia map. Currently it only shows total and active counts.
  - Files: `src/components/visualizations/AustraliaMap.tsx`
  - Rationale: Richer tooltips reduce the number of clicks needed to understand a jurisdiction's policy landscape.

### Phase 6: Accessibility Hardening

- [ ] **6.1 Add ARIA landmarks and skip navigation.** Add a "Skip to main content" link at the top of the page (visually hidden, visible on focus). Ensure the header uses `<nav aria-label="Main navigation">`, the sidebar uses `role="complementary"`, and the main content area uses the correct landmark structure.
  - Files: `src/app/layout.tsx`, `src/components/layout/Header.tsx`, `src/components/filter-sidebar.tsx`
  - Rationale: Screen reader users need landmarks to navigate efficiently. This is a basic WCAG requirement.

- [ ] **6.2 Improve focus management and visible focus indicators.** Audit all interactive elements for visible focus rings. The current `outline-ring/50` global rule may be too subtle. Add a more prominent focus-visible style (e.g., `ring-2 ring-primary ring-offset-2`) to buttons, links, and form controls. Ensure focus is managed correctly when dialogs open/close (focus trap and return).
  - Files: `src/app/globals.css`, various components
  - Rationale: Keyboard users need clear visual indication of where focus is. The current ring at 50% opacity is easy to miss.

- [ ] **6.3 Add `aria-live` regions for dynamic content updates.** When filter results change on the home page or agencies page, announce the new count to screen readers using `aria-live="polite"`. The "Showing X of Y policies" text should be in a live region.
  - Files: `src/app/page.tsx`, `src/app/agencies/page.tsx`
  - Rationale: Screen reader users cannot perceive visual count changes without ARIA live regions.

---

## Verification Criteria

- All pages render correctly and are fully usable on viewport widths of 375px (mobile), 768px (tablet), and 1280px+ (desktop)
- No broken links exist in the navigation or footer
- All hidden feature pages (Framework, Network, Timeline) are discoverable from the main navigation
- `STATUS_COLORS` and similar shared constants are defined in exactly one location and imported everywhere
- Dark mode is functional with no hardcoded color values causing contrast issues
- All interactive elements have visible focus indicators that meet WCAG 2.1 AA contrast requirements
- Filter state on the home page persists across browser back/forward navigation via URL parameters
- Search inputs are debounced and do not cause visible jank during rapid typing
- The `BackToTop` component appears on all scrollable pages after scrolling 300px
- Empty states display consistently across all list/table views

---

## Potential Risks and Mitigations

1. **Dark mode and hardcoded colors**
   Mitigation: The Australia map SVG (`AustraliaMap.tsx:93-110`) uses hardcoded hex values for fills (`#e8e5e0`, `#c7d2e0`, etc.). These will need conditional logic or CSS variable mapping. Plan a dedicated SVG theming pass before enabling the dark mode toggle.

2. **Network page restyling scope**
   Mitigation: At 966 lines, the network page is the largest component. Rather than a full rewrite, focus the visual harmonization on surface-level elements (card styles, stat boxes, sidebar layout) without restructuring the React Flow logic.

3. **URL-synced filters and SSR compatibility**
   Mitigation: `useSearchParams()` in Next.js App Router requires `Suspense` boundaries for streaming SSR. Wrap the home page content in a `<Suspense>` boundary with the skeleton loader as fallback.

4. **Performance impact of adding animations**
   Mitigation: All animations should use `transform` and `opacity` only (GPU-composited properties). Respect `prefers-reduced-motion` universally. Page transitions should be CSS-only, not JS-driven.

5. **Scope creep from adding dark mode**
   Mitigation: Dark mode (Phase 3.3) is the highest-effort single item. It can be deferred to a later iteration without blocking the other improvements. All other phases are independent.

---

## Alternative Approaches

1. **Navigation expansion vs. dedicated landing page**: Instead of adding hidden pages to the nav dropdown (2.1), an alternative is creating a dedicated "Explore" or "Dashboard" landing page that showcases all available views with preview cards and descriptions. Trade-off: Higher development effort but better discoverability.

2. **Bottom sheet vs. full-page overlay for mobile map**: Instead of a bottom sheet (1.1), the mobile map could navigate to a separate `/map/[jurisdiction]` page when a state is tapped. Trade-off: Simpler implementation but loses the smooth side-panel experience and adds route transitions.

3. **Server-side filtering vs. client-side filtering**: The current approach loads all policies client-side and filters in memory. An alternative is moving to API-based server-side filtering with `searchParams`. Trade-off: Better for large datasets but adds API complexity and requires Supabase to be configured for best results.

4. **CSS-only dark mode vs. `next-themes`**: A `prefers-color-scheme` media query approach requires zero JS but doesn't allow manual toggle. Using `next-themes` adds a dependency but gives user control. Recommended: `next-themes` for explicit toggle support.

---

## Implementation Priority Order

| Order | Phase | Effort | Impact |
|-------|-------|--------|--------|
| 1st | Phase 1 (Mobile fixes) | Medium | Critical |
| 2nd | Phase 2 (Navigation & discoverability) | Low-Medium | High |
| 3rd | Phase 3.1 (Design tokens) | Low | Medium |
| 4th | Phase 4 (Polish & micro-interactions) | Medium | Medium |
| 5th | Phase 6 (Accessibility) | Medium | High |
| 6th | Phase 5 (Data presentation) | Medium | Medium |
| 7th | Phase 3.2 (Network harmonization) | Medium | Low-Medium |
| 8th | Phase 3.3 (Dark mode) | High | Medium |
