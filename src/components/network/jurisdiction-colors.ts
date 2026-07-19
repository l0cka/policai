export const JURISDICTION_COLORS: Record<string, string> = {
  federal: '#3157e8',
  nsw: '#146b5a',
  wa: '#b7791f',
  qld: '#b7791f',
  act: '#7c3aed',
  vic: '#7c3aed',
  sa: '#b42318',
  tas: '#b42318',
  nt: '#b42318',
};

/** Resolve CSS variable to a concrete color for D3 (which can't use CSS vars in SVG). */
export function resolveColor(cssVar: string): string {
  const tokenColors: Record<string, string> = {
    'var(--chart-1)': '#3157e8',
    'var(--chart-2)': '#146b5a',
    'var(--chart-3)': '#b7791f',
    'var(--chart-4)': '#7c3aed',
    'var(--chart-5)': '#b42318',
    'var(--status-active)': '#146b5a',
    'var(--status-proposed)': '#9a6109',
    'var(--status-amended)': '#3157e8',
    'var(--status-repealed)': '#657181',
  };
  return tokenColors[cssVar] ?? cssVar;
}
