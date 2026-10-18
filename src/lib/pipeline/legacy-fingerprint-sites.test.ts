import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #249: four comparison sites still compared a fresh retrieval against the
 * current hash only after #244 introduced matchesRetrievedContent. Behaviour
 * is covered in collect.test.ts / source-ingest-workflow.test.ts /
 * register-audit.test.ts; this file fails if those sites regress to a direct
 * contentHash equality check.
 */
const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'src/lib');

function read(relative: string): string {
  return fs.readFileSync(path.join(LIB, relative), 'utf8');
}

describe('legacy fingerprint match sites (#249)', () => {
  it('compares pending document candidates through matchesRetrievedContent', () => {
    const source = read('pipeline/collect.ts');
    expect(source).toContain(
      '!matchesRetrievedContent(pageRetrieval, expectedVersion.contentHash)',
    );
    expect(source).not.toMatch(
      /actualHash\s*!==\s*expectedVersion\.contentHash/,
    );
  });

  it('re-stages ordered collector reviews through matchesRetrievedContent', () => {
    const source = read('source-ingest.ts');
    expect(source).toContain(
      'matchesRetrievedContent(retrieved, priorHash)',
    );
    expect(source).not.toMatch(/priorHash\s*!==\s*refreshedHash/);
  });

  it('keeps a manual reviewedDate on re-approval through matchesRetrievedContent', () => {
    const source = read('source-ingest.ts');
    const keepReviewedDate = /existingReviewedDate:\s*review\.status\s*===\s*"approved"\s*&&\s*matchesRetrievedContent\(retrieved,\s*review\.sourceEvidence\.contentHash\)/g;
    expect(source.match(keepReviewedDate)).toHaveLength(2);
    expect(source).not.toMatch(
      /review\.sourceEvidence\.contentHash\s*===\s*sourceEvidence\.contentHash/,
    );
  });

  it('keeps the stored register hash after an earlier-scheme audit match', () => {
    const source = read('register-audit.ts');
    expect(source).toContain(
      'matchesRetrievedContent(current, previous.contentHash)',
    );
    expect(source).toContain(
      'contentHash: policy.verification.source.contentHash',
    );
  });

  it('documents that every fresh-vs-stored comparison uses matchesRetrievedContent', () => {
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs/collector.md'),
      'utf8',
    );
    expect(docs).toMatch(
      /matchesRetrievedContent[\s\S]*?is the one\s+comparison of a fresh retrieval with a stored hash/,
    );
    expect(docs).toMatch(
      /on the direct path and on the adoption path alike/,
    );
    expect(docs).toMatch(
      /with `--write-evidence`, keeps the stored\s+fingerprint/,
    );
    expect(docs).toMatch(
      /`og:updated_time` is neither read nor\s+fingerprinted/,
    );
  });
});
