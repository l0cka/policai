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

**Nodes:**
- **Policy nodes**: circles sized by tag count (proxy for scope/importance), colored by jurisdiction using `--chart-1` through `--chart-5`
- **Cluster labels**: jurisdiction name rendered as a text label at the centroid of each cluster, not as a node

**Edges:**
- **Intra-jurisdiction**: faint lines between policies sharing an agency or 2+ tags. Stroke color matches jurisdiction.
- **Cross-jurisdiction**: dashed purple lines between policies sharing 3+ tags or referencing the same agency. These are the interesting connections.

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
- **Connected nodes**: list of related policies/agencies with jurisdiction color dot. Clicking a connected node navigates to it in the graph.
- **Tags**: tag pills in muted style
- **Actions**: "View Full Policy →" link to `/policies/[id]`, "Source ↗" external link

Uses shadcn `Badge`, `ScrollArea`, and `Button` components. Background uses `bg-card/95 backdrop-blur-xl` with `border-l border-border`.

### Edge Computation

Edges are computed client-side from the policy data:

1. **Shared agency**: if two policies reference the same agency string (fuzzy matched), create an edge
2. **Shared tags**: if two policies share 2+ tags, create an edge (3+ for cross-jurisdiction)
3. **Dedup**: one edge per policy pair, weight = number of shared connections

This replaces the current static hierarchy with data-driven relationships.

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
src/app/network/page.tsx              — page shell, data fetching, state
src/components/network/
  ForceGraph.tsx                      — D3 force simulation + SVG rendering
  NetworkToolbar.tsx                  — search, jurisdiction pills, stats
  NetworkSidebar.tsx                  — slide-out detail panel
  use-force-simulation.ts            — custom hook for D3 force setup
  compute-edges.ts                   — edge computation from policy data
```

### Data Flow

1. Page fetches `/api/policies` and `/api/agencies` on mount (same as current)
2. `compute-edges.ts` builds edge list from shared agencies/tags
3. `use-force-simulation.ts` initializes D3 force simulation with nodes + edges
4. `ForceGraph.tsx` renders SVG with D3-managed positions
5. Toolbar filter state flows down — filtered-out nodes get `opacity: 0.1`
6. Click events flow up — page sets `selectedNodeId`, sidebar renders

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
