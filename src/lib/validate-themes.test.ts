/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildPolicy } from '@/test/factories';
import { getPolicies } from './data-service';
import { readJsonFile } from './file-store';
import { validatePolicyThemes, validateThemeCoverage } from './validate-data';
import { THEMES } from './themes';
import type { Policy } from '@/types';

const VALID_IDS = `valid theme ids are ${THEMES.map(({ key }) => key).join(', ')}`;

function withThemes(id: string, themes: unknown): Policy {
  return {
    ...buildPolicy({ id, sourceUrl: `https://example.gov.au/${id}` }),
    themes,
  } as Policy;
}

describe('validatePolicyThemes', () => {
  it('accepts one to five listed themes', () => {
    const report = validatePolicyThemes([
      withThemes('one', ['generative-ai']),
      withThemes('five', [
        'generative-ai',
        'courts-tribunals',
        'ai-governance',
        'privacy-data',
        'standards',
      ]),
    ]);
    expect(report.errors).toEqual([]);
  });

  it('requires themes on every record, trashed or not', () => {
    const active: Partial<Policy> = buildPolicy({ id: 'no-themes' });
    delete active.themes;
    const trashed = {
      ...active,
      id: 'trashed-no-themes',
      status: 'trashed',
      sourceUrl: 'https://example.gov.au/trashed',
    };
    const report = validatePolicyThemes([active, trashed] as Policy[]);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'no-themes: themes must be an array of theme ids',
        `no-themes: ${VALID_IDS}`,
        'trashed-no-themes: themes must be an array of theme ids',
        `trashed-no-themes: ${VALID_IDS}`,
      ]),
    );
  });

  it('rejects fewer than one or more than five themes', () => {
    const report = validatePolicyThemes([
      withThemes('none', []),
      withThemes('six', [
        'generative-ai',
        'courts-tribunals',
        'ai-governance',
        'privacy-data',
        'standards',
        'employment',
      ]),
    ]);
    expect(report.errors).toEqual([
      'none: themes must list 1 to 5 themes, not 0',
      `none: ${VALID_IDS}`,
      'six: themes must list 1 to 5 themes, not 6',
      `six: ${VALID_IDS}`,
    ]);
  });

  it('names a non-string entry by its type and value', () => {
    const report = validatePolicyThemes([
      withThemes('nested', [['generative-ai']]),
      withThemes('number', [7]),
    ]);
    expect(report.errors).toEqual([
      'nested: theme entries must be theme id strings, not object ["generative-ai"]',
      `nested: ${VALID_IDS}`,
      'number: theme entries must be theme id strings, not number 7',
      `number: ${VALID_IDS}`,
    ]);
  });

  it('rejects unknown and duplicate themes', () => {
    const report = validatePolicyThemes([
      withThemes('unknown', ['courts', 'Generative AI']),
      withThemes('duplicate', ['employment', 'employment']),
    ]);
    expect(report.errors).toEqual([
      'unknown: unknown theme "courts"',
      'unknown: unknown theme "Generative AI"',
      `unknown: ${VALID_IDS}`,
      'duplicate: duplicate theme "employment"',
      `duplicate: ${VALID_IDS}`,
    ]);
  });
});

describe('validateThemeCoverage', () => {
  const register = [
    withThemes('a', ['employment', 'standards']),
    withThemes('b', ['employment', 'standards']),
    withThemes('c', ['employment', 'agentic-ai']),
  ];

  it('errors when a theme is used by fewer than two register records', () => {
    const report = validateThemeCoverage(register, register);
    expect(report.errors).toContain(
      'themes: "agentic-ai" (Agentic AI) is used by 1 register record; a listed theme needs at least 2',
    );
    expect(report.errors).toContain(
      'themes: "generative-ai" (Generative AI) is used by 0 register records; a listed theme needs at least 2',
    );
    expect(report.errors.join('\n')).not.toMatch(/"employment"|"standards"/);
  });

  it('does not count trashed records', () => {
    const trashed = { ...register[1], status: 'trashed' } as Policy;
    const report = validateThemeCoverage([register[0], trashed], [register[0]]);
    expect(report.errors).toContain(
      'themes: "standards" (Standards and lifecycle) is used by 1 register record; a listed theme needs at least 2',
    );
  });

  it('only warns when a theme on two register records has fewer than two public records', () => {
    const report = validateThemeCoverage(register, [register[0], register[2]]);
    expect(report.warnings).toContain(
      'themes: "standards" (Standards and lifecycle) is on 1 public record; it shows on fewer than 2 until enough of those records are public again',
    );
    expect(report.warnings.join('\n')).not.toMatch(/"employment"/);
    expect(report.errors.join('\n')).not.toMatch(/"standards"/);
  });
});

describe('register themes', () => {
  it('puts every listed theme on at least two non-trashed register records', async () => {
    const register = await readJsonFile<Policy[]>(
      path.join(process.cwd(), 'data', 'policies.json'),
      [],
    );
    const publicPolicies = await getPolicies();

    expect(validatePolicyThemes(register).errors).toEqual([]);
    expect(validateThemeCoverage(register, publicPolicies).errors).toEqual([]);
  });
});
