import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from '../src/lib/canonical.js';

describe('canonicalizeUrl', () => {
  it('strips tracking params, fragments, trailing slash; lowercases host', () => {
    expect(canonicalizeUrl('HTTPS://ProBono.ORG.au/News/Post/?utm_source=x&utm_campaign=y#top'))
      .toBe('https://probono.org.au/News/Post');
  });
  it('keeps meaningful query params', () => {
    expect(canonicalizeUrl('https://grants.gov.au/Go/Show?GoUuid=abc'))
      .toBe('https://grants.gov.au/Go/Show?GoUuid=abc');
  });
});
