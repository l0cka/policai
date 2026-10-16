/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  LAST_RESORT_DATE_META_SELECTORS,
  PUBLICATION_DATE_META_SELECTORS,
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

function metaTag(selector: string, content: string): string {
  const match = /^meta\[(name|property|itemprop)="([^"]+)"\]$/.exec(selector);
  if (!match) throw new Error(`Unsupported date selector ${selector}`);
  return `<meta ${match[1]}="${match[2]}" content="${content}">`;
}

const page = (head: string) =>
  `<html><head>${head}</head><body><main><h1>AI policy</h1><p>Stable obligations.</p></main></body></html>`;

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
