/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTimelineEvent } from '@/test/factories';
import { softwarePasskey } from '@/test/software-passkey';
import { retrieveSource } from '@/lib/pipeline/fetch';
import { buildRecordReviewSchedule } from '@/lib/coverage-report';
import { validateEditorApprovals } from '@/lib/editor-approval-validation';
import { validateDevelopments, validateTimeline } from '@/lib/validate-data';
import type { EditorApproval } from '@/lib/editor-approval';
import {
  approveReconfirmBatch,
  proposeReconfirmation,
  reconfirmApprovalSubject,
  reconfirmPasskeyDecision,
  validateReconfirmLedger,
  type ReconfirmBatch,
} from './register-reconfirm';
import type { Development, TimelineEvent } from '@/types';

const NOW = new Date('2026-11-05T00:00:00.000Z');
const APPROVED_AT = '2026-11-06T00:00:00.000Z';
const CARD = 'https://claude.ai/code/project/chan_x?thread=cmsg_y';

function page(text: string) {
  return `<html><head></head><body><main><h1>Guidance</h1><p>${text}</p></main></body></html>`;
}

/** Official pages as the mocked network serves them today. */
const PAGES = new Map([
  ['https://example.gov.au/due', page('Unchanged obligations.')],
  ['https://example.gov.au/changed', page('Revised obligations.')],
  ['https://example.gov.au/recent', page('Recent obligations.')],
]);

const fetchImpl = (async (input: RequestInfo | URL) => {
  const body = PAGES.get(String(input));
  return body
    ? new Response(body, { headers: { 'content-type': 'text/html' } })
    : new Response('missing', { status: 404 });
}) as unknown as typeof fetch;

const retrieve = (url: string) => retrieveSource(url, { fetchImpl, hashLinkedDocuments: false });

async function hashOf(url: string, body = PAGES.get(url)!) {
  const fetchOne = (async () =>
    new Response(body, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
  return (await retrieveSource(url, { fetchImpl: fetchOne, hashLinkedDocuments: false })).evidence.contentHash!;
}

async function verification(url: string, checkedAt: string, body?: string) {
  return {
    status: 'verified' as const,
    method: 'manual' as const,
    checkedAt,
    checkedBy: 'Daniel Alkurdi',
    notes: 'Approved after reading the official source.',
    source: { url, contentHash: await hashOf(url, body), publishedAt: '2026-06-01', publishedAtPrecision: 'day' as const },
  };
}

async function timelineEvents(): Promise<TimelineEvent[]> {
  const event = async (id: string, url: string, checkedAt: string, body?: string) =>
    buildTimelineEvent({ id, sourceUrl: url, date: '2026-06-01', verification: await verification(url, checkedAt, body) });
  return [
    await event('tl-due', 'https://example.gov.au/due', '2026-08-20T00:00:00.000Z'),
    await event('tl-changed', 'https://example.gov.au/changed', '2026-08-20T00:00:00.000Z', page('Original obligations.')),
    await event('tl-recent', 'https://example.gov.au/recent', '2026-10-30T00:00:00.000Z'),
  ];
}

async function developments(): Promise<Development[]> {
  const development = async (id: string, url: string, checkedAt: string): Promise<Development> => ({
    id,
    title: `Development ${id}`,
    url,
    sourceId: 'editorial-test',
    sourceName: 'Example agency',
    jurisdiction: 'federal',
    publishedAt: '2026-06-01',
    publishedAtPrecision: 'day',
    detectedAt: '2026-06-02T00:00:00.000Z',
    summary: 'An editor-verified development.',
    relevanceScore: 1,
    classification: 'curated',
    assessment: { method: 'editorial', assessedAt: checkedAt, promptVersion: 'editorial-review-v1' },
    verification: await verification(url, checkedAt),
    status: 'promoted',
  });
  return [
    await development('dev-due', 'https://example.gov.au/due', '2026-08-20T00:00:00.000Z'),
    await development('dev-recent', 'https://example.gov.au/recent', '2026-10-30T00:00:00.000Z'),
  ];
}

function mailbox(approvals: EditorApproval[]) {
  return (async () =>
    approvals.length === 0
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify(approvals))) as unknown as typeof fetch;
}

async function proposeTimeline() {
  return proposeReconfirmation(await timelineEvents(), { batches: [] }, {
    kind: 'timeline',
    now: NOW,
    sourceUrl: (event) => event.sourceUrl,
    audit: { retrieve, now: () => NOW },
  });
}

describe('re-confirming timeline events and developments', () => {
  // The retrieval stamps evidence with the clock, so pin it to the proposal day.
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches due timeline events whose source is unchanged and sends a changed one to full review', async () => {
    const proposal = await proposeTimeline();

    expect(proposal.batches).toHaveLength(1);
    expect(proposal.batches[0].entries).toEqual([
      expect.objectContaining({ timelineEventId: 'tl-due', title: 'Manual timeline event' }),
    ]);
    expect(proposal.fullReview).toEqual([
      { id: 'tl-changed', title: 'Manual timeline event', reason: 'changed' },
    ]);
    const changed = proposal.records.find((event) => event.id === 'tl-changed')!;
    expect(changed.verification.status).toBe('stale');
  });

  it('batches due developments by their url and writes back only verification', async () => {
    const records = await developments();
    const proposal = await proposeReconfirmation(records, { batches: [] }, {
      kind: 'development',
      now: NOW,
      sourceUrl: (development) => development.url,
      audit: { retrieve, now: () => NOW },
    });

    expect(proposal.batches.map((batch) => batch.entries)).toEqual([
      [expect.objectContaining({ developmentId: 'dev-due' })],
    ]);
    expect(proposal.fullReview).toEqual([]);
    expect(proposal.records[0]).not.toHaveProperty('sourceUrl');
    expect(proposal.records[0].verification.lastSourceAuditAt).toBe(NOW.toISOString());
    expect(proposal.records[1]).toEqual(records[1]);
  });

  it('approves a batch only on the editor passkey signature over it', async () => {
    const { records, batches } = await proposeTimeline();
    const batch = batches[0];
    const editor = softwarePasskey('Daniel Alkurdi');
    const stranger = softwarePasskey('Someone Else');
    const subject = reconfirmApprovalSubject(batch);

    await expect(reconfirmPasskeyDecision(batch, [editor.passkey], { fetchImpl: mailbox([]) })).rejects.toThrow(
      'the editor has not approved batch 2026-11-05-1 with their passkey',
    );
    await expect(
      reconfirmPasskeyDecision(batch, [editor.passkey], {
        fetchImpl: mailbox([stranger.approve(subject, { receivedAt: APPROVED_AT })]),
      }),
    ).rejects.toThrow('the approval was not signed by a registered editor passkey');
    expect(() =>
      approveReconfirmBatch(records, { batches }, batch.id, { approvedBy: 'Daniel Alkurdi', approvedAt: APPROVED_AT }),
    ).toThrow('decision needs a passkey approval or an https attestationUrl');

    const decision = await reconfirmPasskeyDecision(batch, [editor.passkey], {
      fetchImpl: mailbox([editor.approve(subject, { receivedAt: APPROVED_AT })]),
    });
    const result = approveReconfirmBatch(records, { batches }, batch.id, decision);

    const renewed = result.records.find((event) => event.id === 'tl-due')!;
    expect(renewed.verification).toMatchObject({ status: 'verified', checkedAt: APPROVED_AT, checkedBy: 'Daniel Alkurdi' });
    expect(renewed.verification.notes).toContain('Re-confirmed in batch 2026-11-05-1');
    expect(renewed).not.toHaveProperty('lastReviewedAt');
    expect(
      buildRecordReviewSchedule([renewed], new Date('2027-01-30T00:00:00.000Z'))[0].overdue,
    ).toBe(false);
  });

  it('lets validate:data accept the signed ledger and refuse an unsigned decision', async () => {
    const { records, batches } = await proposeTimeline();
    const batch = batches[0];
    const editor = softwarePasskey('Daniel Alkurdi');
    const signed = approveReconfirmBatch(records, { batches }, batch.id, {
      approvedBy: 'Daniel Alkurdi',
      approvedAt: APPROVED_AT,
      approval: editor.approve(reconfirmApprovalSubject(batch), { receivedAt: APPROVED_AT }),
    });
    const base = { passkeys: [editor.passkey], sourceReviews: [], reconfirmBatches: [] };
    vi.useFakeTimers({ now: new Date('2026-11-07T00:00:00.000Z') });

    expect(validateReconfirmLedger(signed.ledger, { timeline: signed.records })).toEqual({ errors: [], warnings: [] });
    expect(validateTimeline(signed.records, new Set()).errors).toEqual([]);
    expect(
      (await validateEditorApprovals({ ...base, reconfirmBatches: signed.ledger.batches }, base)).errors,
    ).toEqual([]);

    const unsigned: ReconfirmBatch = { ...batch, decision: { approvedBy: 'Daniel Alkurdi', approvedAt: APPROVED_AT, attestationUrl: CARD } };
    expect((await validateEditorApprovals({ ...base, reconfirmBatches: [unsigned] }, base)).errors).toEqual([
      `reconfirmations:${batch.id}: decided without the editor's passkey approval`,
    ]);
    expect(validateReconfirmLedger({ batches: [unsigned] }, { development: await developments() }).errors).toEqual([
      `reconfirmations:${batch.id}: unknown timeline event tl-due`,
    ]);
  });

  it('keeps renewed developments valid', async () => {
    const records = await developments();
    const { batches, records: audited } = await proposeReconfirmation(records, { batches: [] }, {
      kind: 'development',
      now: NOW,
      sourceUrl: (development) => development.url,
      audit: { retrieve, now: () => NOW },
    });
    const editor = softwarePasskey('Daniel Alkurdi');
    const result = approveReconfirmBatch(audited, { batches }, batches[0].id, {
      approvedBy: 'Daniel Alkurdi',
      approvedAt: APPROVED_AT,
      approval: editor.approve(reconfirmApprovalSubject(batches[0]), { receivedAt: APPROVED_AT }),
    });
    vi.useFakeTimers({ now: new Date('2026-11-07T00:00:00.000Z') });

    expect(validateDevelopments(result.records).errors).toEqual([]);
    expect(validateReconfirmLedger(result.ledger, { development: result.records }).errors).toEqual([]);
  });
});
