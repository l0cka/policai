/* @vitest-environment node */

import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import {
  LAST_RESORT_DATE_META_SELECTORS,
  PUBLICATION_DATE_META_SELECTORS,
  publicationDateCandidates,
} from './date-metadata';
import { extractPublishedDateEvidence } from './extract';
import { retrieveSource } from './fetch';

async function fingerprint(html: string): Promise<string | undefined> {
  const fetchImpl = (async () =>
    new Response(html, {
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch;
  const retrieved = await retrieveSource('https://www.example.gov.au/policy', {
    fetchImpl,
    hashLinkedDocuments: false,
  });
  return retrieved.evidence.contentHash;
}

function metaTag(
  selector: string,
  content: string,
  decoys: Record<string, string> = {},
): string {
  const match = /^meta\[(name|property|itemprop)="([^"]+)"\]$/.exec(selector);
  if (!match) throw new Error(`Unsupported date selector ${selector}`);
  const attributes = Object.entries({ ...decoys, [match[1]]: match[2] })
    .map(([attribute, value]) => `${attribute}="${value}"`)
    .join(' ');
  return `<meta ${attributes} content="${content}">`;
}

const DECOY_ATTRIBUTES = {
  name: 'twitter:label1',
  property: 'og:see_also',
  itemprop: 'about',
};

const page = (head: string, afterMain = '') =>
  `<html><head>${head}</head><body><main><h1>AI policy</h1><p>Stable obligations.</p></main>${afterMain}</body></html>`;

describe('publication-date metadata in fingerprints', () => {
  const selectors = [
    ...PUBLICATION_DATE_META_SELECTORS,
    ...Object.values(LAST_RESORT_DATE_META_SELECTORS).flat(),
  ];

  it.each(selectors)(
    'changes the fingerprint whenever %s changes the extracted date',
    async (selector) => {
      const first = page(metaTag(selector, '2026-10-08'));
      const second = page(metaTag(selector, '2026-10-12'));

      expect(extractPublishedDateEvidence(first)?.date).toBe('2026-10-08');
      expect(extractPublishedDateEvidence(second)?.date).toBe('2026-10-12');
      expect(await fingerprint(first)).not.toBe(await fingerprint(second));
    },
  );

  it.each(selectors)(
    'changes the fingerprint when %s changes the extracted date on a tag that also carries the other attributes',
    async (selector) => {
      const first = page(metaTag(selector, '2026-10-08', DECOY_ATTRIBUTES));
      const second = page(metaTag(selector, '2026-10-12', DECOY_ATTRIBUTES));

      expect(extractPublishedDateEvidence(first)?.date).toBe('2026-10-08');
      expect(extractPublishedDateEvidence(second)?.date).toBe('2026-10-12');
      expect(await fingerprint(first)).not.toBe(await fingerprint(second));
    },
  );

  it.each(selectors)(
    'changes the fingerprint when duplicate %s tags swap order and the extracted date changes',
    async (selector) => {
      const first = page(
        metaTag(selector, '2026-10-08') + metaTag(selector, '2026-10-12'),
      );
      const second = page(
        metaTag(selector, '2026-10-12') + metaTag(selector, '2026-10-08'),
      );

      expect(extractPublishedDateEvidence(first)?.date).toBe('2026-10-08');
      expect(extractPublishedDateEvidence(second)?.date).toBe('2026-10-12');
      expect(await fingerprint(first)).not.toBe(await fingerprint(second));
    },
  );

  it.each([
    [
      'the footer',
      (datetime: string) =>
        page('', `<footer>Published <time datetime="${datetime}">x</time></footer>`),
    ],
    [
      'an aside inside main',
      (datetime: string) =>
        `<html><body><main><h1>AI policy</h1><p>Stable obligations.</p><aside>Published <time datetime="${datetime}">x</time></aside></main></body></html>`,
    ],
  ])(
    'changes the fingerprint when a publication time in %s changes the extracted date',
    async (_region, build) => {
      const first = build('2026-01-01');
      const second = build('2026-03-03');

      expect(extractPublishedDateEvidence(first)?.date).toBe('2026-01-01');
      expect(extractPublishedDateEvidence(second)?.date).toBe('2026-03-03');
      expect(await fingerprint(first)).not.toBe(await fingerprint(second));
    },
  );

  it('changes the fingerprint when two publication times swap order and the extracted date changes', async () => {
    const build = (first: string, second: string) =>
      page(
        '',
        `<footer><p>Published <time datetime="${first}">x</time></p><p>Published <time datetime="${second}">y</time></p></footer>`,
      );
    const first = build('2026-01-01', '2026-03-03');
    const second = build('2026-03-03', '2026-01-01');

    expect(extractPublishedDateEvidence(first)?.date).toBe('2026-01-01');
    expect(extractPublishedDateEvidence(second)?.date).toBe('2026-03-03');
    expect(await fingerprint(first)).not.toBe(await fingerprint(second));
  });

  it('changes the fingerprint when a publication label in an aside inside main changes the extracted date', async () => {
    const build = (label: string) =>
      `<html><body><main><h1>AI policy</h1><p>Stable obligations.</p><aside>Published: ${label}</aside></main></body></html>`;
    const first = build('1 March 2026');
    const second = build('3 March 2026');

    expect(extractPublishedDateEvidence(first)?.date).toBe('2026-03-01');
    expect(extractPublishedDateEvidence(second)?.date).toBe('2026-03-03');
    expect(await fingerprint(first)).not.toBe(await fingerprint(second));
  });

  it('changes the fingerprint when the generator changes the date platform', async () => {
    const editTime = '<meta name="dcterms.date" content="2026-10-12">';
    const drupal = page(
      `<meta name="Generator" content="Drupal 10 (https://www.drupal.org)">${editTime}`,
    );
    const wordpress = page(
      `<meta name="generator" content="WordPress 6.6">${editTime}`,
    );

    expect(extractPublishedDateEvidence(drupal)).toBeNull();
    expect(extractPublishedDateEvidence(wordpress)?.date).toBe('2026-10-12');
    expect(await fingerprint(drupal)).not.toBe(await fingerprint(wordpress));
  });

  it('keeps the fingerprint when the platform changes and no last-resort tag is present', async () => {
    const wordpress = page('<meta name="generator" content="WordPress 6.6">');
    const drupal = page(
      '<meta name="Generator" content="Drupal 10 (https://www.drupal.org)">',
    );

    expect(publicationDateCandidates(load(drupal))).toEqual(
      publicationDateCandidates(load(wordpress)),
    );
    expect(extractPublishedDateEvidence(drupal)).toBeNull();
    expect(extractPublishedDateEvidence(wordpress)).toBeNull();
    expect(await fingerprint(drupal)).toBe(await fingerprint(wordpress));
  });

  it('keeps the fingerprint across a Drupal version bump that leaves the platform unchanged', async () => {
    const drupal10 = page(
      '<meta name="Generator" content="Drupal 10 (https://www.drupal.org)">',
    );
    const drupal11 = page(
      '<meta name="Generator" content="Drupal 11 (http://drupal.org) + GovCMS (http://govcms.gov.au)">',
    );

    expect(await fingerprint(drupal10)).toBe(await fingerprint(drupal11));
  });
});
