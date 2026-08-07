# Deadline Agenda Timeline — Design

Date: 2026-08-07
Status: Approved by Daniel (in-session)

## Purpose

Replace the plain `<ul>` upcoming-deadlines block on the dashboard feed page
with an agenda timeline: dates readable at a glance, urgency visible, entries
linked to their source items. Chosen over a month-grid calendar because the
live data is sparse (7 upcoming deadlines across ~5 months).

## Component

`dashboard/app/deadlines.tsx` — the `Deadlines` server component moves out of
`page.tsx` into its own file and renders:

- Entries **grouped by month** (Australia/Sydney), month name as a group header.
- Each entry: a **date block** (day number over month abbreviation), the
  deadline **label** in bold, the source item's **title linking to the article**
  (same `^https?://` `safeHref` guard as the feed), and a **countdown chip**:
  "today", "in N days" (under 14 days), "in N weeks" (under 10 weeks), else
  "in N months".
- **Urgency colour** on the date block: ≤7 days warm/red accent, ≤30 days
  amber, further out neutral. Colours defined as tokens in `globals.css`
  alongside the existing palette; both light and dark theme.
- Stays on the feed page, above the item list, as now.

## Query

Same JSONB source (`items.entities->'deadlines'`), plus:

- date-shape filter `d->>'date' ~ '^\d{4}-\d{2}-\d{2}$'` (agent-written dates),
- upcoming filter as now (≥ today in Sydney),
- `DISTINCT ON (date, label)` dedupe (duplicate ICL entries exist),
- item `url` selected for linking,
- `LIMIT 12`.

## Edge cases

- No upcoming deadlines → render nothing (unchanged).
- Item URL failing the scheme guard → title renders as plain text.
- Countdown computed against Sydney "today"; a deadline today shows "today".

## Testing / verification

Dashboard has no test harness; the countdown/grouping logic lives in small
pure functions in the component file. Build and visual verification happen on
Argus via `ops/deploy.sh` (no heavy work on the MacBook). Worker tests are
untouched.
