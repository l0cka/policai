/**
 * Editorial decisions of 2026-08-07, part two: the two tracked-record
 * timeline reviews cannot be rejected by design; publishing the keeper
 * re-verifies the existing timeline event and reconciles the duplicate
 * radar entry. Directed by the maintainer via the verified evidence pack.
 */
import {
  approveStagedSource,
  publishStagedSource,
  stageSourceCapture,
  type BrowserCaptureInput,
} from '../src/lib/source-ingest';
import { getSourceReviews } from '../src/lib/data-service';

const ACTOR = 'l0cka — editorial decision via verified evidence pack, 2026-08-07';
const FIRECRAWL = process.env.FIRECRAWL_URL ?? 'http://127.0.0.1:3003/v2/scrape';

interface Decision {
  suffix: string;
  date: string;
  note: string;
  capture: boolean;
}

const DECISIONS: Decision[] = [
  {
    suffix: 'dt0ni8',
    date: '2026-05-13',
    capture: process.env.CAPTURE_DT0NI8 === '1',
    note: 'Duplicate revision of verified timeline event tl-2026-05-13-senate-ai-data-centres-inquiry; aph.gov.au confirms referred 13 May 2026, submissions close 1 September 2026, reporting 16 November 2026.',
  },
  {
    suffix: 'lk6582',
    date: '2025-02-03',
    capture: process.env.CAPTURE_LK6582 === '1',
    note: 'Duplicate of verified timeline event tl-2025-02-03-nsw-supreme-court-practice-note-sc-gen-23-commence; the live practice-notes index still lists SC Gen 23 (Use of Generative AI), commenced 3 February 2025.',
  },
];

async function resolve(suffix: string) {
  const reviews = await getSourceReviews();
  const hits = reviews.filter((review) => review.id.endsWith(suffix));
  if (hits.length !== 1) {
    throw new Error(`suffix ${suffix} matched ${hits.length} reviews`);
  }
  return hits[0];
}

async function firecrawlCapture(url: string, note: string): Promise<BrowserCaptureInput> {
  const response = await fetch(FIRECRAWL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false }),
  });
  if (!response.ok) throw new Error(`firecrawl ${response.status} for ${url}`);
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  const text = payload.data?.markdown ?? '';
  if (!payload.success || text.trim().length === 0) {
    throw new Error(`firecrawl empty for ${url}`);
  }
  return {
    pageTitle: payload.data?.metadata?.title ?? url,
    pageText: text,
    references: [url],
    capturedAt: new Date().toISOString(),
    capturedBy: ACTOR,
    notes: `Captured via self-hosted Firecrawl because the host refuses plain HTTP. ${note}`,
    linkedDocuments: [],
  };
}

async function main() {
  const failures: string[] = [];

  for (const decision of DECISIONS) {
    try {
      const review = await resolve(decision.suffix);
      if (review.status === 'published') {
        console.log(`SKIP ${decision.suffix}: already published`);
        continue;
      }
      const capture = decision.capture
        ? await firecrawlCapture(review.sourceUrl, decision.note)
        : undefined;

      if (capture && review.status !== 'approved') {
        // The same capture is reused for staging, approval and publication so
        // the content fingerprint stays identical across all three steps.
        await stageSourceCapture({
          url: review.sourceUrl,
          entryKind: review.entryKind,
          proposedRecord: review.proposedRecord as never,
          actor: ACTOR,
          notes: decision.note,
          browserCapture: capture,
        });
      }
      if (review.status !== 'approved') {
        const draft = review.proposedRecord as { datePrecision?: string };
        const needsPrecision =
          review.entryKind === 'timeline_event' && !draft.datePrecision;
        await approveStagedSource({
          id: review.id,
          actor: ACTOR,
          // The staged draft omitted datePrecision; the source states the exact
          // commencement day, restated in the reviewedDate note below.
          proposedRecord: needsPrecision
            ? ({ ...review.proposedRecord, datePrecision: 'day' } as never)
            : undefined,
          approvalNotes: decision.note,
          reviewedDate: {
            date: decision.date,
            precision: 'day' as never,
            notes: `Date confirmed against the live official source on 2026-08-07. ${decision.note}`,
          },
          browserCapture: capture,
        });
      }
      await publishStagedSource(review.id, { browserCapture: capture });
      console.log(`PUBLISHED ${decision.suffix}`);
    } catch (error) {
      failures.push(`publish ${decision.suffix}`);
      console.error(`FAILED publish ${decision.suffix}:`, String(error).slice(0, 300));
    }
  }

  console.log(failures.length === 0 ? 'DUPLICATES RECONCILED' : `${failures.length} FAILURES: ${failures.join(', ')}`);
  if (failures.length > 0) process.exitCode = 1;
}

main();
