import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/court-requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/court-requirements')>()),
  getPublicCourtRequirements: vi.fn(async () => [
    {
      id: 'r1',
      policyId: 'p1',
      actor: 'Legal practitioners',
      modality: 'must',
      action: 'Disclose AI use.',
      conditions: [],
      exceptions: [],
      topics: ['disclosure'],
      source: { url: 'https://example.gov.au/p1', contentHash: 'a'.repeat(64), locator: 'para 1', quote: 'Practitioners must disclose.' },
    },
  ]),
}));

describe('/courts/requirements.json', () => {
  it('serves the shown fields of each requirement and no source provenance', async () => {
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(body.requirements).toEqual([
      {
        id: 'r1',
        policyId: 'p1',
        actor: 'Legal practitioners',
        modality: 'must',
        action: 'Disclose AI use.',
        conditions: [],
        exceptions: [],
        topics: ['disclosure'],
        source: { locator: 'para 1', quote: 'Practitioners must disclose.' },
      },
    ]);
  });
});
