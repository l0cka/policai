/**
 * Editorial decisions of 2026-08-08, executed for the maintainer.
 *
 * The maintainer reviewed the evidence pack (22 pending source reviews
 * verified against their official sources) and directed: reject the
 * out-of-scope item, publish the five clean policy instruments, hold the
 * remainder pending metadata corrections. Duplicate tracked-record reviews
 * cannot be rejected by design; publishing the keeper reconciles them.
 *
 * Each reviewedDate below restates evidence a human confirmed against the
 * live official source on 2026-08-08. Browser captures are supplied for the
 * three hosts that refuse plain HTTP at publish-time re-verification.
 */
import {
  approveStagedSource,
  publishStagedSource,
  rejectStagedSource,
  stageSourceCapture,
  type BrowserCaptureInput,
} from '../src/lib/source-ingest';
import { getSourceReviews } from '../src/lib/data-service';
import {
  getPrimaryPolicyDate,
  type PolicyDraft,
  type TimelineEventDraft,
} from '../src/types';

const ACTOR = 'l0cka — editorial decision via verified evidence pack, 2026-08-08';
const FIRECRAWL = 'http://127.0.0.1:3003/v2/scrape';

interface Decision {
  suffix: string;
  note: string;
  capture: boolean;
}

const REJECTS: Array<[string, string]> = [
  ['1gdyt66', 'Out of scope: a securities-fraud prosecution of a company that used AI in its product, not an AI policy or governance development.'],
];

const PUBLISHES: Decision[] = [
  // Newest revision: the sequence model refuses to publish older ones, and
  // the three QGEA revisions are byte-identical, so newest is the keeper.
  { suffix: '1oub5xk', capture: false, note: 'QGEA AI governance policy — source states Policy, v1.0.0, Current/Mandated, Effective September 2024–current.' },
  { suffix: 'wo7okk', capture: false, note: 'VIC Gen-AI VPS guideline — endorsed VSB 24 Sep 2024, made by Secretary DPC 27 Nov 2024, updated 12 Feb 2025; all three dates confirmed on vic.gov.au.' },
  { suffix: 'gp4ujh', capture: true, note: 'ACSC frontier-AI guidance for boards — cyber.gov.au states First published 05 Aug 2026, AICD partnership confirmed.' },
  { suffix: '1ctddce', capture: true, note: 'WA AI Policy and Assurance Framework — wa.gov.au page confirmed; current instrument PDF is ai_policyv2.pdf under 2025-07.' },
  // Newer of the two Senate-inquiry revisions; the sequence model requires it.
  { suffix: 'womqb9', capture: true, note: 'Senate AI and data centres inquiry — aph.gov.au states referred 13 May 2026, submissions close 1 Sep 2026, reporting 16 Nov 2026.' },
];

async function resolve(suffix: string) {
  const reviews = await getSourceReviews();
  const hits = reviews.filter((review) => review.id.endsWith(suffix));
  if (hits.length !== 1) {
    throw new Error(`suffix ${suffix} matched ${hits.length} reviews`);
  }
  return hits[0];
}

function recordDate(record: PolicyDraft | TimelineEventDraft) {
  if ('dates' in record && Array.isArray(record.dates) && record.dates.length > 0) {
    const primary = getPrimaryPolicyDate(record as never);
    return { date: String(primary.date), precision: primary.precision ?? 'day' };
  }
  if ('date' in record && record.date) {
    return {
      date: String(record.date),
      precision: (record as { datePrecision?: string }).datePrecision ?? 'day',
    };
  }
  throw new Error('no date on proposed record');
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

  for (const [suffix, reason] of REJECTS) {
    try {
      const review = await resolve(suffix);
      if (review.status !== 'pending_review') {
        console.log(`SKIP reject ${suffix}: already ${review.status}`);
        continue;
      }
      await rejectStagedSource(review.id, reason);
      console.log(`REJECTED  ${suffix}`);
    } catch (error) {
      failures.push(`reject ${suffix}`);
      console.error(`FAILED reject ${suffix}:`, String(error).slice(0, 200));
    }
  }

  for (const decision of PUBLISHES) {
    try {
      const review = await resolve(decision.suffix);
      if (review.status === 'published') {
        console.log(`SKIP ${decision.suffix}: already published`);
        continue;
      }
      const record = review.proposedRecord as PolicyDraft | TimelineEventDraft;
      const { date, precision } = recordDate(record);
      const sourceUrl =
        ('sourceUrl' in record ? record.sourceUrl : undefined) ?? review.url;

      const capture = decision.capture
        ? await firecrawlCapture(sourceUrl, decision.note)
        : undefined;

      if (capture && review.status !== 'approved') {
        // A capture changes the retrieval method, so it must be staged first;
        // approval then requires a fresh capture of its own.
        await stageSourceCapture({
          url: sourceUrl,
          entryKind: review.entryKind,
          proposedRecord: record,
          actor: ACTOR,
          notes: decision.note,
          browserCapture: capture,
        });
      }
      if (review.status !== 'approved') {
        await approveStagedSource({
          id: review.id,
          actor: ACTOR,
          approvalNotes: decision.note,
          reviewedDate: {
            date,
            precision: precision as never,
            notes: `Date confirmed against the live official source on 2026-08-08. ${decision.note}`,
          },
          browserCapture: capture,
        });
      }
      await publishStagedSource(review.id, { browserCapture: capture });
      console.log(`PUBLISHED ${decision.suffix}`);
    } catch (error) {
      failures.push(`publish ${decision.suffix}`);
      console.error(`FAILED publish ${decision.suffix}:`, String(error).slice(0, 220));
    }
  }

  console.log(failures.length === 0 ? 'ALL DECISIONS EXECUTED' : `${failures.length} FAILURES: ${failures.join(', ')}`);
  if (failures.length > 0) process.exitCode = 1;
}

main();
