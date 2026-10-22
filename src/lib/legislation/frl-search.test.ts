import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyBySearchMatch } from '@/lib/pipeline/classify';
import { extractFromFrlSearch, frlAiInstrumentSearch } from './frl-search';

const fixture = () => readFileSync(join(__dirname, '__fixtures__/frl/search-ai-instruments.json'), 'utf8');

describe('frlAiInstrumentSearch', () => {
  it('asks the register for instruments matching any AI phrase, newest as made first', () => {
    expect(frlAiInstrumentSearch()).toBe(
      "https://api.prod.legislation.gov.au/v1/Titles/Search(criteria='and(or(text(%22artificial%20intelligence%22,nameAndText,contains),text(%22machine%20learning%22,nameAndText,contains),text(%22generative%20AI%22,nameAndText,contains),text(%22automated%20decision%22,nameAndText,contains)),collection(LegislativeInstrument))')?%24expand=searchContexts%28%24expand%3DfullTextVersion%29&%24orderby=asMadeRegisteredAt+desc&%24top=20",
    );
  });
});

describe('extractFromFrlSearch', () => {
  it('keeps instruments that use AI terms substantively and drops passing mentions', () => {
    const result = extractFromFrlSearch(fixture());
    expect(result.itemCount).toBe(3);
    expect(result.feedValid).toBe(true);
    expect(result.candidates.map(({ url, title, dateHint }) => ({ url, title, dateHint }))).toEqual([
      {
        url: 'https://www.legislation.gov.au/F2026L01224/asmade/details',
        title: 'ASIC Market Integrity Rules (Futures Markets) Amendment Instrument 2026/575',
        dateHint: '2026-09-17',
      },
      {
        url: 'https://www.legislation.gov.au/F2026L01223/asmade/details',
        title: 'ASIC Market Integrity Rules (Securities Markets) Amendment Instrument 2026/574',
        dateHint: '2026-09-17',
      },
    ]);
    expect(result.candidates[1].text).toContain('relevance 27.1');
  });

  it('skips a compilation that matched, since the instrument that added the text is reviewed', () => {
    const response = JSON.parse(fixture());
    response.value[0].searchContexts.fullTextVersion.isAsMade = false;
    expect(extractFromFrlSearch(JSON.stringify(response)).candidates.map(({ title }) => title)).toEqual([
      'ASIC Market Integrity Rules (Securities Markets) Amendment Instrument 2026/574',
    ]);
  });

  it('treats an empty result as a valid search, not a broken page', () => {
    expect(extractFromFrlSearch('{"value":[]}')).toEqual({ itemCount: 0, candidates: [], feedValid: true });
  });

  it('refuses a response that is not a search result', () => {
    expect(() => extractFromFrlSearch('{"id":"F2026L01223"}')).toThrow('not a list of titles');
  });

  it('classifies a match as relevant for review, stating the match as its summary', () => {
    const [candidate] = extractFromFrlSearch(fixture()).candidates;
    expect(classifyBySearchMatch(candidate)).toMatchObject({ isRelevant: true, summary: candidate.text });
  });
});
