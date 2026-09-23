#!/usr/bin/env node
// Copy the canonical design tokens into each app, or check the copies.
//
//   node scripts/sync-design-tokens.mjs          write the copies
//   node scripts/sync-design-tokens.mjs --check  exit 1 if a copy drifts
//
// Policai and Policai A2J build in separate contexts (the A2J Docker build sees
// only apps/probono/dashboard), so neither app imports across the boundary.
// Each keeps a byte-identical copy of design/tokens.css instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CANONICAL = join(root, 'design/tokens.css');
export const COPIES = [
  join(root, 'src/app/design-tokens.css'),
  join(root, 'apps/probono/dashboard/app/design-tokens.css'),
];

const HEADER =
  '/* GENERATED from design/tokens.css by scripts/sync-design-tokens.mjs. Do not edit. */\n';

export function expectedCopy() {
  return HEADER + readFileSync(CANONICAL, 'utf8');
}

export function driftedCopies() {
  const expected = expectedCopy();
  return COPIES.filter((path) => {
    try {
      return readFileSync(path, 'utf8') !== expected;
    } catch {
      return true;
    }
  }).map((path) => relative(root, path));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const drifted = driftedCopies();
    if (drifted.length) {
      console.error(
        `Design tokens out of sync: ${drifted.join(', ')}\n` +
          'Edit design/tokens.css, then run: node scripts/sync-design-tokens.mjs',
      );
      process.exit(1);
    }
    console.log('Design tokens in sync.');
  } else {
    const expected = expectedCopy();
    for (const path of COPIES) writeFileSync(path, expected);
    console.log(`Wrote ${COPIES.map((p) => relative(root, p)).join(', ')}`);
  }
}
