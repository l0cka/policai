import { describe, expect, it } from 'vitest';
import type { Host } from '@/lib/pipeline/host';
import type { Body, BodyId } from './bodies';
import {
  creativeCommonsTerms,
  parseSiteReuse,
  reuseForUrl,
  reuseLabel,
  siteReuseCoverage,
  siteReuseRows,
} from './site-reuse';

const stated = {
  host: 'www.oaic.gov.au',
  status: 'stated',
  terms: { kind: 'creative_commons', licence: 'CC-BY-4.0', exceptions: 'Coat of Arms and logos' },
  termsUrl: 'https://www.oaic.gov.au/copyright',
  checkedAt: '2026-10-22',
};

describe('creativeCommonsTerms', () => {
  it.each([
    ['CC-BY-4.0', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
    ['CC-BY-3.0-AU', 'CC BY 3.0 AU', 'https://creativecommons.org/licenses/by/3.0/au/'],
    ['CC-BY-NC-ND-4.0', 'CC BY-NC-ND 4.0', 'https://creativecommons.org/licenses/by-nc-nd/4.0/'],
  ])('%s reads as %s', (id, label, url) => {
    expect(creativeCommonsTerms(id)).toEqual({ label, url });
  });

  it.each(['CC-BY-4.0-AU', 'CC-BY-9.9', 'CC-ND-4.0', 'CC0-1.0'])('rejects %s', (id) => {
    expect(creativeCommonsTerms(id)).toBeUndefined();
  });
});

describe('parseSiteReuse', () => {
  it('reads each status', () => {
    const entries = parseSiteReuse([
      stated,
      { host: 'www.aph.gov.au', status: 'refused', note: 'Akamai challenge', checkedAt: '2026-10-22' },
      { host: 'ncat.nsw.gov.au', status: 'not_stated', note: 'No copyright page', checkedAt: '2026-10-22' },
    ]);
    expect(entries.map(reuseLabel)).toEqual([
      'CC BY 4.0',
      'Not checked: site refuses Policai',
      'No copyright statement found',
    ]);
  });

  it.each([
    [{ ...stated, termsUrl: 'https://elsewhere.gov.au/copyright' }, 'termsUrl must be on www.oaic.gov.au'],
    [{ ...stated, checkedAt: '2026-02-30' }, 'checkedAt must be YYYY-MM-DD'],
    [{ ...stated, terms: { kind: 'creative_commons', licence: 'CC-BY-9.9' } }, 'unknown Creative Commons licence'],
    [{ ...stated, terms: { kind: 'custom' } }, 'custom terms need a summary'],
    [{ host: 'www.aph.gov.au', status: 'refused', checkedAt: '2026-10-22' }, 'refused needs a note'],
  ])('rejects a malformed entry', (entry, message) => {
    expect(() => parseSiteReuse([entry])).toThrow(message);
  });

  it('accepts a copyright page on the www variant of the host', () => {
    expect(() =>
      parseSiteReuse([{ ...stated, host: 'asic.gov.au', termsUrl: 'https://www.asic.gov.au/copyright' }]),
    ).not.toThrow();
  });

  it('rejects a host recorded twice', () => {
    expect(() => parseSiteReuse([stated, stated])).toThrow('duplicate host');
  });
});

describe('reuseForUrl', () => {
  it('finds the entry for the exact host of a URL', () => {
    const entries = parseSiteReuse([stated]);
    expect(reuseForUrl(entries, 'https://www.oaic.gov.au/privacy/guidance')?.host).toBe('www.oaic.gov.au');
    expect(reuseForUrl(entries, 'https://oaic.gov.au/privacy')).toBeUndefined();
    expect(reuseForUrl(entries, 'not a url')).toBeUndefined();
  });
});

describe('siteReuseCoverage', () => {
  const bodies: Body[] = [
    {
      id: 'oaic' as BodyId,
      name: 'OAIC',
      jurisdiction: 'federal',
      tier: 'A',
      hosts: ['www.oaic.gov.au' as Host, 'ovic.vic.gov.au' as Host],
      scope: { status: 'unassessed' },
    },
  ];

  it('errors on a host no body owns and warns on an unchecked body host', () => {
    const entries = parseSiteReuse([
      stated,
      { host: 'www.example.gov.au', status: 'refused', note: 'n/a', checkedAt: '2026-10-22' },
    ]);
    expect(siteReuseCoverage(entries, bodies)).toEqual({
      errors: ['siteReuse:www.example.gov.au: not a host of any body in bodies.json'],
      warnings: ['siteReuse: ovic.vic.gov.au has no recorded reuse terms'],
    });
  });

  it('errors on a check dated after today in Sydney', () => {
    const entries = parseSiteReuse([{ ...stated, checkedAt: '2026-10-23' }]);
    // 13:30 UTC on 22 Oct is 00:30 on 23 Oct in Sydney.
    expect(siteReuseCoverage(entries, bodies, new Date('2026-10-22T13:30:00Z')).errors).toEqual([]);
    expect(siteReuseCoverage(entries, bodies, new Date('2026-10-22T12:00:00Z')).errors).toEqual([
      'siteReuse:www.oaic.gov.au: checkedAt 2026-10-23 is in the future (Australia/Sydney)',
    ]);
  });
});

describe('siteReuseRows', () => {
  it('lists each host once, naming every body that publishes on it', () => {
    const shared = 'www.nsw.gov.au' as Host;
    const bodies: Body[] = [
      { id: 'a' as BodyId, name: 'NSW Government', jurisdiction: 'nsw', tier: 'A', hosts: [shared], scope: { status: 'unassessed' } },
      { id: 'b' as BodyId, name: 'NSW DCS', jurisdiction: 'nsw', tier: 'A', hosts: ['www.digital.nsw.gov.au' as Host, shared], scope: { status: 'unassessed' } },
    ];
    const rows = siteReuseRows(bodies, []);
    expect(rows.map((row) => [row.host, row.bodyNames, row.entry])).toEqual([
      ['www.nsw.gov.au', ['NSW Government', 'NSW DCS'], undefined],
      ['www.digital.nsw.gov.au', ['NSW DCS'], undefined],
    ]);
  });
});
