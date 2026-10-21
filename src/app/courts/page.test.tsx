import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeId } from '@/lib/themes';

vi.mock('@/lib/data-service', () => ({
  getPolicies: vi.fn(),
  getArticles: vi.fn(),
}));

vi.mock('@/lib/court-requirements', () => ({
  getPublicCourtRequirements: vi.fn(async () => []),
}));

describe('/courts page', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({ matches: true }),
    });
  });

  beforeEach(() => {
    window.history.replaceState({}, '', '/courts');
  });

  it('passes court analysis and related maps into the browser', async () => {
    const { getPolicies, getArticles } = await import('@/lib/data-service');
    const court = {
      id: 'federal-court-gpn-ai',
      title: 'Federal Court GPN-AI',
      description: 'Practice note',
      jurisdiction: 'federal' as const,
      type: 'practice_note' as const,
      status: 'active' as const,
      effectiveDate: '2026-04-16',
      dates: [
        {
          type: 'issued' as const,
          date: '2026-04-16',
          precision: 'day' as const,
          primary: true,
        },
      ],
      agencies: ['Federal Court of Australia'],
      tags: ['courts'],
      themes: ['courts-tribunals', 'generative-ai'] as ThemeId[],
      sourceUrl: 'https://www.fedcourt.gov.au/gpn-ai',
      content: '',
      aiSummary: '',
      createdAt: '2026-04-16',
      updatedAt: '2026-04-16',
      verification: {
        status: 'verified' as const,
        source: { url: 'https://www.fedcourt.gov.au/gpn-ai' },
      },
    };
    vi.mocked(getPolicies).mockImplementation(async (filters) => {
      if (filters?.type === 'practice_note') return [court];
      return [court];
    });
    vi.mocked(getArticles).mockResolvedValue([
      {
        slug: 'courts-and-tribunals-ai-rules',
        type: 'explainer',
        title: 'How Australian courts and tribunals govern the use of AI',
        summary: 'There is no single national rule.',
        status: 'published',
        publishedAt: '2026-10-17',
        cites: ['federal-court-gpn-ai'],
        sources: ['https://www.fedcourt.gov.au/gpn-ai'],
        corrections: [],
        body: '',
        blocks: [],
        citations: [],
        sourceUnderReview: false,
        registerCharts: {},
      },
    ]);

    const { default: CourtsPage } = await import('./page');
    const page = await CourtsPage();
    render(page);

    expect(
      screen.getByRole('heading', { name: 'Court-focused analysis' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'How Australian courts and tribunals govern the use of AI',
      }),
    ).toHaveAttribute('href', '/analysis/courts-and-tribunals-ai-rules');
  });
});
