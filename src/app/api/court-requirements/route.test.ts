/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/public-api')>()),
  checkPublicApiRequest: vi.fn(async () => null),
}));

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
      extraction: { method: 'local-model', model: 'internal', extractedAt: '2026-11-01T00:00:00.000Z' },
      verification: { status: 'verified', checkedBy: 'Daniel Alkurdi', notes: 'internal' },
      policy: { id: 'p1', title: 'Practice Note', jurisdiction: 'nsw' },
    },
  ]),
}));

describe('/api/court-requirements', () => {
  it('serves shown fields and the policy stub, never extraction, verification or the source content hash', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('https://policai.org/api/court-requirements'));
    const body = await response.json();
    expect(body.data).toEqual([
      {
        id: 'r1',
        policyId: 'p1',
        actor: 'Legal practitioners',
        modality: 'must',
        action: 'Disclose AI use.',
        conditions: [],
        exceptions: [],
        topics: ['disclosure'],
        source: { url: 'https://example.gov.au/p1', locator: 'para 1', quote: 'Practitioners must disclose.' },
        policy: { id: 'p1', title: 'Practice Note', jurisdiction: 'nsw' },
      },
    ]);
  });
});
