/**
 * Shared design tokens — centralised visual constants used across the app.
 * Import from '@/lib/design-tokens' instead of redefining locally.
 */

/** Tailwind text-color classes keyed by PolicyStatus */
export const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-700',
  proposed: 'text-amber-600',
  amended: 'text-blue-700',
  repealed: 'text-gray-500',
};

/** Tailwind background-color classes keyed by PolicyStatus */
export const STATUS_BG_COLORS: Record<string, string> = {
  active: 'bg-green-100',
  proposed: 'bg-amber-100',
  amended: 'bg-blue-100',
  repealed: 'bg-gray-100',
};
