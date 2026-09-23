import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { buildPolicyMarkdown } from '@/lib/policy-markdown';

describe('buildPolicyMarkdown', () => {
  it('carries provenance inside the artifact', () => {
    const markdown = buildPolicyMarkdown(
      buildPolicy({
        id: 'policy-123',
        title: 'National AI Ethics Framework',
        lastReviewedAt: '2026-09-01T00:00:00.000Z',
      }),
    );

    expect(markdown).toContain('# National AI Ethics Framework');
    expect(markdown).toContain('- Jurisdiction: Federal');
    expect(markdown).toContain('- Type: Framework');
    expect(markdown).toContain('- Status: Active');
    expect(markdown).toContain('- Effective: 1 January 2025');
    expect(markdown).toContain(
      '- Official source: https://example.gov.au/policies/national-ai-ethics-framework',
    );
    expect(markdown).toContain('- Verification: verified (manual), checked 10 July 2026');
    expect(markdown).toContain('- Last editorial review: 1 September 2026');
    expect(markdown).toContain(
      '- Policai record: https://policai.org/policies/policy-123',
    );
    expect(markdown).toContain('## Summary\n\nResponsible AI guardrails for government use.');
    expect(markdown).toContain('## Content\n\nDetailed policy content');
    expect(markdown).toContain('Verify against the official source');
  });

  it('states a missing editorial review instead of omitting it', () => {
    const markdown = buildPolicyMarkdown(buildPolicy({ lastReviewedAt: undefined }));
    expect(markdown).toContain(
      '- Last editorial review: never re-verified since publication',
    );
  });

  it('keeps date precision instead of inventing a day', () => {
    const markdown = buildPolicyMarkdown(
      buildPolicy({
        dates: [
          { type: 'published', date: '2024-06-01', precision: 'month', primary: true },
        ],
      }),
    );
    expect(markdown).toContain('- Published: June 2024');
    expect(markdown).not.toContain('1 June 2024');
  });

  it('points superseded records at their successor', () => {
    const markdown = buildPolicyMarkdown(
      buildPolicy({ status: 'superseded', supersededBy: 'policy-new' }),
    );
    expect(markdown).toContain(
      '- Superseded by: https://policai.org/policies/policy-new',
    );
  });
});
