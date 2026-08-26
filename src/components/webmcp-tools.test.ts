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
    const fetchImpl = vi.fn(async () =>
      Response.json({
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
      }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();

    await registerPolicaiWebMcpTools(
      { registerTool },
      fetchImpl,
      controller.signal,
    );

    expect(registered.map((tool) => tool.name)).toEqual([
      'search_policies',
      'get_policy',
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

    await expect(
      registered[0].execute({ jurisdiction: 'overseas' }),
    ).rejects.toThrow('jurisdiction must be one of');
  });
});
