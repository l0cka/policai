export const JURISDICTION_COLORS: Record<string, string> = {
  federal: 'var(--chart-1)',
  nsw: 'var(--chart-2)',
  wa: 'var(--chart-3)',
  qld: 'var(--chart-3)',
  act: 'var(--chart-4)',
  vic: 'var(--chart-4)',
  sa: 'var(--chart-5)',
  tas: 'var(--chart-5)',
  nt: 'var(--chart-5)',
};

/** Resolve CSS variable to a concrete color for D3 (which can't use CSS vars in SVG). */
export function resolveColor(cssVar: string): string {
  if (typeof window === 'undefined') return '#888';
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar.replace('var(', '').replace(')', ''))
    .trim();
  return resolved || '#888';
}
