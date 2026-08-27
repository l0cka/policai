/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import {
  registerPolicaiWebMcpTools,
  type WebMcpModelContext,
} from './webmcp-tools';

describe('Policai WebMCP tools', () => {
  it('registers and executes the read-only public tools', async () => {
    const registered: Parameters<WebMcpModelContext['registerTool']>[0][] = [];
    const registerTool = vi.fn(async (tool) => {
      registered.push(tool);
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/court-requirements')) {
        return Response.json({
          data: [
            {
              id: 'requirement-a',
              policyId: 'policy-a',
              actor: 'Judicial officers',
              modality: 'must_not',
              action: 'Use generative AI to formulate reasons.',
              conditions: [],
              exceptions: [],
              topics: ['reasons'],
              source: {
                url: 'https://example.gov.au/policy-a',
                contentHash: 'a'.repeat(64),
                locator: 'paragraph 4',
                quote: 'Judicial officers must not use generative AI.',
              },
              extraction: {
                method: 'manual',
                extractedAt: '2026-01-01T00:00:00Z',
                extractedBy: 'Editor',
              },
              verification: {
                status: 'verified',
                reviewedAt: '2026-01-02T00:00:00Z',
                reviewedBy: 'Reviewer',
              },
              policy: {
                id: 'policy-a',
                title: 'Policy A',
                jurisdiction: 'federal',
                agencies: ['Agency'],
                status: 'active',
              },
            },
          ],
          success: true,
        });
      }
      return Response.json({
          data: [
            {
              id: 'policy-a',
              title: 'Policy A',
              description: 'Description',
              jurisdiction: 'federal',
              type: 'framework',
              status: 'active',
              effectiveDate: '2026-01-01',
              agencies: ['Agency'],
              sourceUrl: 'https://example.gov.au/policy-a',
            },
          ],
          success: true,
        });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    await registerPolicaiWebMcpTools(
      { registerTool },
      fetchImpl,
      controller.signal,
    );

    expect(registered.map((tool) => tool.name)).toEqual([
      'search_policies',
      'get_policy',
      'search_court_requirements',
      'list_developments',
    ]);
    expect(
      registered.every(
        (tool) =>
          tool.annotations.readOnlyHint && tool.annotations.untrustedContentHint,
      ),
    ).toBe(true);
    expect(registerTool).toHaveBeenCalledWith(
      expect.any(Object),
      { signal: controller.signal },
    );

    const result = await registered[0].execute(
      { search: 'assurance', jurisdiction: 'federal' },
      { signal: controller.signal },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/policies?search=assurance&jurisdiction=federal',
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    expect(result).toEqual({
      total: 1,
      available: 1,
      policies: [
        {
          id: 'policy-a',
          title: 'Policy A',
          description: 'Description',
          jurisdiction: 'federal',
          type: 'framework',
          status: 'active',
          effectiveDate: '2026-01-01',
          agencies: ['Agency'],
          sourceUrl: 'https://example.gov.au/policy-a',
          lastReviewedAt: undefined,
        },
      ],
    });

    const requirementResult = await registered[2].execute(
      { jurisdiction: 'nsw', actor: 'judge', modality: 'should_not', limit: 10 },
      { signal: controller.signal },
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/api/court-requirements?jurisdiction=nsw&actor=judge&modality=should_not&limit=10',
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    expect(requirementResult).toMatchObject({
      total: 1,
      requirements: [{ id: 'requirement-a', modality: 'must_not' }],
    });

    await expect(
      registered[0].execute({ jurisdiction: 'overseas' }),
    ).rejects.toThrow('jurisdiction must be one of');
  });
});
