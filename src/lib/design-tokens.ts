/**
 * Shared design tokens — centralised visual constants used across the app.
 * Import from '@/lib/design-tokens' instead of redefining locally.
 */

/** Tailwind text-color classes keyed by PolicyStatus */
export const STATUS_COLORS: Record<string, string> = {
  active: 'text-[var(--status-active)]',
  proposed: 'text-[var(--status-proposed)]',
  amended: 'text-[var(--status-amended)]',
  superseded: 'text-[var(--status-repealed)]',
  closed: 'text-[var(--status-repealed)]',
  repealed: 'text-[var(--status-repealed)]',
};

/** Tailwind background-color classes keyed by PolicyStatus */
export const STATUS_BG_COLORS: Record<string, string> = {
  active: 'bg-[var(--status-active-bg)]',
  proposed: 'bg-[var(--status-proposed-bg)]',
  amended: 'bg-[var(--status-amended-bg)]',
  superseded: 'bg-[var(--status-repealed-bg)]',
  closed: 'bg-[var(--status-repealed-bg)]',
  repealed: 'bg-[var(--status-repealed-bg)]',
};
