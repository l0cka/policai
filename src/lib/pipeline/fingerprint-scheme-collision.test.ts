import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchesRetrievedContent,
  retrieveSource,
} from '@/lib/pipeline/fetch';

/**
 * #262: a page that gains dcterms.created or a Drupal generator used to match
 * as unchanged because the legacy fingerprint of the new page equalled the
 * current fingerprint of the old page. Behavioural coverage lives in
 * fetch.test.ts, collect.test.ts, source-ingest-workflow.test.ts and
 * register-audit.test.ts. This file fails if the three schemes stop being
 * structurally disjoint or if the docs drop the call-site / #262 claims.
 */
const ROOT = path.resolve(__dirname, '../../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const retrievePage = (head: string) =>
  retrieveSource('https://example.gov.au/policy', {
    fetchImpl: (async () =>
      new Response(
        `<html><head>${head}</head><body><main><h1>AI policy</h1><p>Stable obligations.</p></main></body></html>`,
        { headers: { 'content-type': 'text/html' } },
      )) as unknown as typeof fetch,
    hashLinkedDocuments: false,
  });

describe('fingerprint scheme collision (#262)', () => {
  it('keeps the three HTML fingerprint preimages structurally disjoint', () => {
    const source = read('src/lib/pipeline/fetch.ts');
    expect(source).toMatch(/publicationDates/);
    expect(source).toMatch(/date-platform:\$\{detectDateMetaPlatform/);
    expect(source).toMatch(
      /earlierContentHashes:\s*\[\s*hashOf\(\{[\s\S]*?date-platform:[\s\S]*?\}\),\s*hashOf\(\{[\s\S]*?LEGACY_FINGERPRINT_METADATA_KEYS/,
    );
    const currentPreimage = source.match(
      /contentHash:\s*hashOf\(\{([\s\S]*?)\}\),/,
    )?.[1];
    expect(currentPreimage).toContain('publicationDates');
    expect(currentPreimage).not.toContain('date-platform:');
  });

  it('rejects a stored current hash once the page gains dcterms.created', async () => {
    const before = await retrievePage('');
    const after = await retrievePage(
      '<meta name="dcterms.created" content="2026-06-01">',
    );
    expect(after.earlierContentHashes).toHaveLength(2);
    expect(after.earlierContentHashes).not.toContain(
      before.evidence.contentHash,
    );
    expect(matchesRetrievedContent(after, before.evidence.contentHash)).toBe(
      false,
    );
  });

  it('rejects a stored current hash once a dcterms.date page becomes GovCMS', async () => {
    const before = await retrievePage(
      '<meta name="dcterms.date" content="2025-03-01">',
    );
    const after = await retrievePage(
      '<meta name="Generator" content="Drupal 10 (https://www.drupal.org)"><meta name="dcterms.date" content="2025-03-01">',
    );
    expect(after.earlierContentHashes).not.toContain(
      before.evidence.contentHash,
    );
    expect(matchesRetrievedContent(after, before.evidence.contentHash)).toBe(
      false,
    );
  });

  it('documents disjoint schemes, discoveredAt retention, and transitionForDocumentHash', () => {
    const docs = read('docs/collector.md');
    expect(docs).toMatch(
      /discoveredAt` retention of a\s+re-staged review/,
    );
    expect(docs).toMatch(
      /`transitionForDocumentHash`\s+in the pending-candidate loop compares the fresh current fingerprint/,
    );
    expect(docs).toMatch(
      /page that gains\s+`dcterms\.created` or a Drupal generator[\s\S]*?reads as changed \(#262\)/,
    );
    expect(docs).toMatch(
      /only the current one\s+carries a `publicationDates` list/,
    );
  });
});
