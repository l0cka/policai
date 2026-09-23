import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('shared design tokens', () => {
  it('keeps both app copies identical to design/tokens.css', () => {
    const script = path.resolve(__dirname, '../../scripts/sync-design-tokens.mjs');
    // Throws (non-zero exit) when either copy has drifted.
    const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(out).toContain('in sync');
  });
});
