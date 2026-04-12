# Network Page Redesign

## Problem

The current network page is a 995-line monolith using React Flow to display a rigid 3-column hierarchy (Jurisdiction → Agency → Policy). With 38+ policies and 50 agencies, it's unreadable, the layout doesn't reveal meaningful relationships, and the visual design is inconsistent with the rest of the app.

## Design

Replace the React Flow hierarchical layout with a D3.js force-directed graph. Policies cluster by jurisdiction, with cross-jurisdiction edges revealing shared themes and agencies. The page uses a floating toolbar for filtering, a slide-out sidebar for node details, and the app's existing design system throughout.

### Layout

Full-bleed force graph with two overlay layers:

1. **Floating toolbar** (top) — search box, jurisdiction toggle pills, policy count stats
2. **Slide-out sidebar** (right, on node click) — policy/agency details with connected nodes list

The graph fills the page height (calc viewport minus header). No cards, stat grids, or sidebar chrome from the current design — the graph is the entire content area.

### Force Graph

Built with D3.js force simulation (already a project dependency — no React Flow needed).

**Nodes (policy-only):**
- **Policy nodes**: circles sized by tag count (proxy for scope/importance), colored by jurisdiction using `--chart-1` through `--chart-5`
- **Cluster labels**: jurisdiction name rendered as a text label at the centroid of each cluster, not as a node
- **No agency nodes**: agencies are not graph entities. They appear as metadata in the sidebar when a policy is selected (listed under "Agencies" as plain text). This avoids the 50-agency clutter problem and keeps the graph focused on policy-to-policy relationships.

**Edges (tag-based only):**
- **Intra-jurisdiction**: faint lines between policies sharing 2+ tags. Stroke color matches jurisdiction.
- **Cross-jurisdiction**: dashed purple lines between policies sharing 3+ tags. These are the interesting connections.

**Forces:**
- Cluster force: policies attract toward their jurisdiction centroid
- Repulsion: nodes repel to prevent overlap
- Link force: connected nodes attract gently
- Collision: prevents node overlap with padding

**Interactions:**
- Hover: node grows slightly, label appears (policy title), connected edges highlight
- Click: opens slide-out sidebar with full details
- Drag: reposition individual nodes
- Zoom/pan: standard D3 zoom behavior
- No minimap (the floating toolbar + search replaces the need)

### Floating Toolbar

Compact horizontal bar pinned to the top of the graph area:

- **Search**: text input with magnifying glass icon, filters nodes by title match (fades non-matching nodes)
- **Jurisdiction pills**: one per jurisdiction with data, colored using chart colors. Click to toggle visibility. Active pills are filled, inactive are outlined.
- **Stats**: right-aligned, shows "{n} policies · {n} jurisdictions" in mono font

Built with existing shadcn `Input` component and Tailwind classes. Uses `bg-card/90 backdrop-blur` for the glass effect over the graph.

### Slide-out Sidebar

320px panel that slides in from the right when a node is clicked. Shows:

- **Header**: "POLICY DETAIL" label in mono uppercase, close button
- **Badges**: status (using `--status-*` colors), type, jurisdiction
- **Title**: policy title in semibold
- **Date**: effective date in muted text
- **Description**: 2-3 line description
- **Connected policies**: list of policies linked by shared tags, with jurisdiction color dot. Clicking navigates to that node in the graph.
- **Agencies**: plain text list of agency names from `policy.agencies` (non-navigable metadata, not graph entities)
- **Tags**: tag pills in muted style
- **Actions**: "View Full Policy →" link to `/policies/[id]`, "Source ↗" external link

Uses shadcn `Badge`, `ScrollArea`, and `Button` components. Background uses `bg-card/95 backdrop-blur-xl` with `border-l border-border`.

### Edge Computation

Edges are computed **server-side** via a new API endpoint `GET /api/network` that returns pre-computed nodes and edges. This avoids unreliable client-side fuzzy matching.

**Tag-based edges only (no agency string matching):**

The `Policy.agencies` field is free-text `string[]` with no canonical IDs — values like "Data and Digital Government Strategy Branch" don't resolve to agency records. Fuzzy matching would create false relationships and miss real ones. Instead, edges are derived solely from shared tags, which are structured and consistent:

1. **Intra-jurisdiction**: two policies in the same jurisdiction sharing 2+ tags → edge
2. **Cross-jurisdiction**: two policies in different jurisdictions sharing 3+ tags → edge
3. **Dedup**: one edge per policy pair, weight = number of shared tags

The `/api/network` endpoint returns `{ nodes: PolicyNode[], edges: Edge[] }` so the client receives a trusted, pre-computed graph. Agency names appear as metadata in the sidebar (non-navigable) but do not drive graph topology.

**Future improvement:** When `Policy.agencies` is normalized to canonical agency IDs (foreign keys to the `agencies` table), agency-based edges can be added reliably.

### Styling

All colors from CSS variables — works in both light and dark mode:
- Node fills: `--chart-1` (federal), `--chart-2` (NSW), `--chart-3` (WA/QLD), `--chart-4` (ACT/VIC), `--chart-5` (other)
- Status indicators on nodes: thin ring using `--status-active`, `--status-proposed`, etc.
- Background: `--background` with subtle dot pattern using `--border` color
- Fonts: IBM Plex Sans for labels, IBM Plex Mono for stats/counts
- Transitions: 200ms ease for hover effects, 300ms for sidebar slide

### Component Structure

Break the 995-line monolith into focused components:

```
src/app/network/page.tsx              — page shell, data fetching, state management
src/app/api/network/route.ts          — server-side edge computation, returns nodes + edges
src/components/network/
  ForceGraph.tsx                      — D3 force simulation + SVG rendering
  NetworkToolbar.tsx                  — search, jurisdiction pills, stats
  NetworkSidebar.tsx                  — slide-out detail panel
  use-force-simulation.ts            — custom hook for D3 force setup
```

### Data Flow

1. Page fetches `/api/network` on mount (single request, returns pre-computed nodes + edges)
2. `use-force-simulation.ts` initializes D3 force simulation with the response data
3. `ForceGraph.tsx` renders SVG with D3-managed positions
4. Toolbar filter state flows down — filtered-out nodes get `opacity: 0.1`
5. Click events flow up — page sets `selectedNodeId`, sidebar renders

### Loading, Error, and Empty States

The graph is the only content area, so degraded states must be explicit:

- **Loading**: centered spinner with "Loading network..." text (same pattern as other pages)
- **Error (fetch failure / 429)**: centered error message with "Failed to load network data" and a "Retry" button. No blank canvas.
- **Empty (0 policies)**: centered illustration with "No policies found" message and link to the policies page
- **Partial data**: if the API returns data but edge computation yields 0 edges, show the nodes without edges and a subtle note: "No cross-policy connections found yet"

The page component manages `loading`, `error`, and `data` states explicitly — never renders the graph SVG until data is confirmed present.

### What Gets Removed

- React Flow dependency usage on this page (keep the package for now since other pages may use it)
- All inline node styling (replaced by CSS variables)
- The stat cards grid above the graph
- The legend card (jurisdiction colors are self-documenting via pills)
- The "Controls" help card (standard zoom/pan, discoverable)
- The node detail Dialog (replaced by sidebar)

## Verification

1. `npm run build` + `npm run lint` pass
2. Graph renders with all policies from Supabase, clustered by jurisdiction
3. Cross-jurisdiction edges visible between related policies
4. Search filters nodes in real-time
5. Jurisdiction pills toggle cluster visibility
6. Click opens sidebar with correct policy details
7. "View Full Policy" links to correct `/policies/[id]` page
8. Works in both light and dark mode
9. Responsive: on mobile, sidebar becomes a bottom sheet or full-screen overlay
