import type { CSSProperties } from 'react';
import { JURISDICTION_NAMES, type Jurisdiction } from '@/types';

/**
 * Each jurisdiction carries an accent taken from its own government livery
 * (Queensland maroon, Northern Territory ochre, and so on). The values live in
 * `globals.css` as `--jd-*` so they follow the active theme.
 */
export function jurisdictionAccent(jurisdiction: string): string {
  return jurisdiction in JURISDICTION_NAMES
    ? `var(--jd-${jurisdiction as Jurisdiction})`
    : 'var(--muted-foreground)';
}

/**
 * Sets the custom property the `.ink-rail` utility reads, so a row or card
 * highlights in the colour of the jurisdiction that issued it.
 */
export function jurisdictionRailStyle(jurisdiction: string): CSSProperties {
  return { '--rail-color': jurisdictionAccent(jurisdiction) } as CSSProperties;
}
