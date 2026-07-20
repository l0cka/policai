import { describe, expect, it } from 'vitest';
import { isRelevantScrapedCandidate } from './scraper-filter';

describe('isRelevantScrapedCandidate', () => {
  it('does not treat Aids to Navigation as an AI signal', () => {
    expect(
      isRelevantScrapedCandidate({
        title: '2022-23 Aids to Navigation Maintenance Procurement',
        url: 'https://www.anao.gov.au/work/performance-audit/aids-to-navigation-maintenance-procurement',
        text: 'Audit of maritime navigation-aid maintenance procurement.',
      }),
    ).toBe(false);
  });

  it('still accepts standalone AI and data-centre governance signals', () => {
    expect(
      isRelevantScrapedCandidate({
        title: 'AI assurance framework',
        url: 'https://example.gov.au/ai-assurance',
        text: 'Government guidance for agencies.',
      }),
    ).toBe(true);
    expect(
      isRelevantScrapedCandidate({
        title: 'National data centre policy consultation',
        url: 'https://example.gov.au/data-centre-policy',
        text: 'Consultation on compute infrastructure governance.',
      }),
    ).toBe(true);
  });
});
