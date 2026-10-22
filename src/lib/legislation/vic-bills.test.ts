import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFromVicBillSearch, vicBillSearch } from './vic-bills';

const fixture = () => readFileSync(join(__dirname, '__fixtures__/state/vic-bills-in-parliament.json'), 'utf8');

describe('vicBillSearch', () => {
  it('asks the index for every bill before the current Parliament with a short GET query', () => {
    expect(vicBillSearch()).toBe(
      'https://www.legislation.vic.gov.au/api/tide/elasticsearch/content-legislation-vic-gov-au__production__sapi_node/_search?_source_excludes=es_attachment%2Crendered_item&q=type%3Abill+AND+field_bill_parliament_current%3Atrue&size=100',
    );
  });
});

describe('extractFromVicBillSearch', () => {
  it('reads every current bill and keeps none, since no current title names AI', () => {
    expect(extractFromVicBillSearch(fixture())).toEqual({ itemCount: 46, candidates: [], feedValid: true });
  });

  it('keeps an AI-titled bill, citing its public bill page', () => {
    const response = JSON.parse(fixture());
    Object.assign(response.hits.hits[0]._source, {
      title: ['Crimes Amendment (Artificial Intelligence Generated Abuse Material) Bill 2026'],
      url: ['/site-6/bills/crimes-amendment-artificial-intelligence-generated-abuse-material-bill-2026'],
    });
    expect(extractFromVicBillSearch(JSON.stringify(response)).candidates).toEqual([
      {
        url: 'https://www.legislation.vic.gov.au/bills/crimes-amendment-artificial-intelligence-generated-abuse-material-bill-2026',
        title: 'Crimes Amendment (Artificial Intelligence Generated Abuse Material) Bill 2026',
        text: 'Before the Victorian Parliament; status: Council - second reading (passed Assembly).',
        dateHint: '2026-08-11',
        dateHintPrecision: 'day',
      },
    ]);
  });

  it('refuses a response with no hits', () => {
    expect(() => extractFromVicBillSearch('{"error":"forbidden"}')).toThrow('has no hits');
  });
});
