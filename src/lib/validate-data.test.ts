/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { buildPolicy, buildTimelineEvent } from '@/test/factories';
import {
  isAllowedSourceHost,
  validateDevelopments,
  validatePolicies,
  validateTimeline,
} from './validate-data';

describe('isAllowedSourceHost', () => {
  it('allows https gov.au hosts and the CSIRO exception', () => {
    expect(isAllowedSourceHost('https://www.industry.gov.au/x')).toBe(true);
    expect(isAllowedSourceHost('https://supremecourt.nsw.gov.au/x')).toBe(true);
    expect(isAllowedSourceHost('https://www.csiro.au/en/news')).toBe(true);
  });

  it('rejects http, non-government, and malformed URLs', () => {
    expect(isAllowedSourceHost('http://www.industry.gov.au/x')).toBe(false);
    expect(isAllowedSourceHost('https://example.com/x')).toBe(false);
    expect(isAllowedSourceHost('not a url')).toBe(false);
  });
});

describe('validatePolicies', () => {
  it('accepts a well-formed policy', () => {
    const report = validatePolicies([buildPolicy()]);
    expect(report.errors).toEqual([]);
  });

  it('flags enum violations, duplicate ids, and duplicate source URLs', () => {
    const a = buildPolicy({ id: 'dup' });
    const b = buildPolicy({
      id: 'dup',
      // @ts-expect-error deliberately invalid
      type: 'memo',
      sourceUrl: a.sourceUrl,
    });

    const report = validatePolicies([a, b]);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate id'),
        expect.stringContaining('invalid type "memo"'),
        expect.stringContaining('duplicate sourceUrl'),
      ]),
    );
  });

  it('warns when supersededBy points nowhere', () => {
    const report = validatePolicies([
      buildPolicy({ supersededBy: 'ghost-policy' }),
    ]);
    expect(report.warnings).toEqual([
      expect.stringContaining('supersededBy "ghost-policy"'),
    ]);
  });
});

describe('validateTimeline', () => {
  it('flags dangling relatedPolicyId references', () => {
    const report = validateTimeline(
      [buildTimelineEvent({ relatedPolicyId: 'missing-policy' })],
      new Set(['some-other-policy']),
    );
    expect(report.errors).toEqual([
      expect.stringContaining('relatedPolicyId "missing-policy"'),
    ]);
  });
});

describe('validateDevelopments', () => {
  it('flags invalid scores and statuses', () => {
    const report = validateDevelopments([
      {
        id: 'dev-1',
        title: 'Example',
        url: 'https://www.example.gov.au/x',
        sourceId: 's',
        sourceName: 'S',
        jurisdiction: 'federal',
        detectedAt: '2026-07-10T00:00:00.000Z',
        relevanceScore: 1.4,
        classification: 'ai',
        // @ts-expect-error deliberately invalid
        status: 'archived',
      },
    ]);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('relevanceScore'),
        expect.stringContaining('invalid status "archived"'),
      ]),
    );
  });
});
