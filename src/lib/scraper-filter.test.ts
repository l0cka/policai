import { describe, expect, it } from 'vitest';
import { countAiMentions, isRelevantScrapedCandidate } from './scraper-filter';

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

describe('countAiMentions', () => {
  it('counts AI terms in body text, including standalone AI', () => {
    expect(
      countAiMentions(
        'Artificial intelligence will change work. Generative AI tools and machine learning need rules; AI is here.',
      ),
    ).toBe(4);
  });

  it('does not count words that merely contain the letters ai', () => {
    expect(countAiMentions('The aid package and the airline said again that the rain maintained.')).toBe(0);
  });

  it('returns zero for empty text', () => {
    expect(countAiMentions('')).toBe(0);
  });
});
