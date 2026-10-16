/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import approvedMapping from '../../scripts/policy-themes-2026-10-17.json';
import { applyThemeMapping } from './policy-themes-migration';
import { THEMES } from './themes';

const register = `${JSON.stringify(
  [
    { id: 'a', title: 'A', tags: ['courts'], createdAt: '2026-01-01' },
    { id: 'b', title: 'B', tags: [], createdAt: '2026-01-02' },
  ],
  null,
  2,
)}\n`;

const mapping = {
  a: ['Courts and tribunals', 'Generative AI'],
  b: ['Standards and lifecycle'],
};

describe('applyThemeMapping', () => {
  it('adds theme ids after tags and leaves every other byte alone', () => {
    const output = applyThemeMapping(register, mapping);
    const records = JSON.parse(output);

    expect(Object.keys(records[0])).toEqual(['id', 'title', 'tags', 'themes', 'createdAt']);
    expect(records.map((record: { themes: string[] }) => record.themes)).toEqual([
      ['courts-tribunals', 'generative-ai'],
      ['standards'],
    ]);
    for (const record of records) delete record.themes;
    expect(`${JSON.stringify(records, null, 2)}\n`).toBe(register);
  });

  it('is idempotent', () => {
    const once = applyThemeMapping(register, mapping);
    expect(applyThemeMapping(once, mapping)).toBe(once);
  });

  it('keeps a missing trailing newline missing', () => {
    expect(applyThemeMapping(register.trimEnd(), mapping).endsWith(']')).toBe(true);
  });

  it('fails on records missing from the mapping, unknown ids and unknown labels', () => {
    expect(() =>
      applyThemeMapping(register, {
        a: ['Courts', 'Generative AI'],
        c: ['Frontier AI'],
      }),
    ).toThrow(
      [
        'theme mapping does not match data/policies.json:',
        'b: record has no row in the mapping',
        'c: mapping row has no record',
        'a: unknown theme label "Courts"',
      ].join('\n'),
    );
  });
});

describe('approved #305 mapping', () => {
  it('uses exactly the labels in THEMES', () => {
    const mappedLabels = new Set(Object.values(approvedMapping).flat());
    expect([...mappedLabels].sort()).toEqual(
      THEMES.map((theme) => theme.label).sort(),
    );
  });
});
