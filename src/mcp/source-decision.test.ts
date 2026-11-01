/* @vitest-environment node */
import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTimelineEvent } from '@/test/factories';
import type { SourceReview, TimelineEvent } from '@/types';

// Isolate only persistence: handlers, ingestion, extraction and validators are real.
const { files } = vi.hoisted(() => ({ files: new Map<string, unknown>() }));
vi.mock('@/lib/file-store', () => ({
  readJsonFile: async (path: string, fallback: unknown) =>
    structuredClone(files.get(path.split('/').pop()!) ?? fallback),
  writeJsonFile: async (path: string, value: unknown) => {
    files.set(path.split('/').pop()!, structuredClone(value));
  },
}));
const { mailbox } = vi.hoisted(() => ({ mailbox: [] as EditorApproval[] }));
vi.mock('@/lib/editor-approval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/editor-approval')>()),
  fetchEditorApproval: async (subject: string) =>
    mailbox.findLast((approval) => approval.subject === subject) ?? null,
}));
vi.mock('@/lib/data-lock', () => ({
  withDataMutationLock: async (run: () => Promise<unknown>) => run(),
}));
import {
  handleProposeSourceReviewBatch,
  handleProposeSourceDecision,
  handleRecordDecision,
  handleShowSourceProposal,
  handleStageSourceCapture,
} from './tool-handlers';
import { getTimelineEvents } from '@/lib/data-service';
import { approvalSubject, type EditorApproval } from '@/lib/editor-approval';
import { softwarePasskey } from '@/test/software-passkey';
import { sourceReviewBatchSubject, type SourceReviewBatchLedger } from '@/lib/source-review-batch';

const inquiryUrl = 'https://example.gov.au/inquiry';
const cardUrl = 'https://claude.ai/code/project/chan_example?thread=cmsg_example';
const oldDescription = 'The committee is due to report on 16 November 2026.';
const newDescription = 'The committee is due to report on 23 March 2027.';

const event = () =>
  buildTimelineEvent({
    id: 'senate-inquiry',
    sourceUrl: inquiryUrl,
    date: '2026-05-13',
    datePrecision: 'day',
    description: oldDescription,
  });
const readEvent = async (): Promise<TimelineEvent> =>
  (await getTimelineEvents(undefined, { access: 'admin', includeGenerated: false }))[0];
const readReview = () => (files.get('source-reviews.json') as SourceReview[])[0];

async function proposeInquiryUpdate() {
  const staged = await handleStageSourceCapture({
    url: inquiryUrl,
    entryKind: 'timeline_event',
    targetRecordId: 'senate-inquiry',
    proposedRecord: { ...event(), description: newDescription },
    capture: {
      pageTitle: 'Inquiry into artificial intelligence and data centres',
      pageText: 'Reporting date: 23 March 2027. The committee tabled a progress report on 20 October 2026.',
      references: [],
      capturedAt: new Date().toISOString(),
      capturedBy: 'Claude (agent)',
      requestedBy: 'Daniel Alkurdi',
      notes: 'The host refuses the collector, so the rendered committee page was captured in a browser.',
      linkedDocuments: [],
    },
  });
  await handleProposeSourceDecision({
    id: staged.id,
    proposedBy: 'Claude (agent)',
    reviewedDate: {
      date: '2026-05-13',
      precision: 'day',
      notes: 'The committee page states the Senate referred the inquiry on 13 May 2026.',
    },
  });
  return handleShowSourceProposal({ id: staged.id });
}

const decide = (id: string, proposalHash: string, extra: Record<string, unknown> = {}) =>
  handleRecordDecision({
    id,
    proposalHash,
    reviewer: 'Daniel Alkurdi',
    attestationUrl: cardUrl,
    ...extra,
  });

beforeEach(() => {
  mailbox.length = 0;
  files.clear();
  files.set(basename('data/timeline.json'), [event()]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('propose, then decide on a decision card', () => {
  it('shows the editor the change before deciding', async () => {
    const card = await proposeInquiryUpdate();

    expect(card.current?.description).toBe(oldDescription);
    expect(card.proposed.description).toBe(newDescription);
    expect(card.evidence).toMatchObject({
      capturedBy: 'Claude (agent)',
      requestedBy: 'Daniel Alkurdi',
    });
    expect(card.proposalCode).toBe(card.proposalHash.slice(0, 8));
    expect(card.blockers).toEqual([]);
    expect((await readEvent()).description).toBe(oldDescription);
    expect(readReview().status).toBe('pending_review');
  });

  it('lists what would block approval before a card is posted', async () => {
    const card = await proposeInquiryUpdate();
    await handleProposeSourceDecision({ id: card.id, proposedBy: 'Claude (agent)' });

    const { blockers } = await handleShowSourceProposal({ id: card.id });

    expect(blockers).toEqual([expect.stringContaining('date')]);
    expect(readReview().status).toBe('pending_review');
  });

  it('publishes the proposal on one decision, reusing the staged capture, with honest attribution', async () => {
    const card = await proposeInquiryUpdate();

    const published = await decide(card.id, card.proposalHash);

    expect(published.status).toBe('published');
    expect(published.decision).toMatchObject({
      proposalHash: card.proposalHash,
      decidedBy: 'Daniel Alkurdi',
      attestationUrl: cardUrl,
    });
    const updated = await readEvent();
    expect(updated.description).toBe(newDescription);
    expect(updated.verification).toMatchObject({
      status: 'verified',
      checkedBy: 'Daniel Alkurdi',
      source: {
        browserCapture: { capturedBy: 'Claude (agent)', requestedBy: 'Daniel Alkurdi' },
      },
    });
    expect(updated.verification?.notes).toContain(cardUrl);
    expect(updated.verification?.notes).toContain('Proposed by Claude (agent).');
  });

  it('treats a repeated decision as already applied', async () => {
    const card = await proposeInquiryUpdate();
    await decide(card.id, card.proposalHash);
    const before = structuredClone(files.get('timeline.json'));

    const again = await decide(card.id, card.proposalHash);

    expect(again.status).toBe('published');
    expect(files.get('timeline.json')).toEqual(before);
  });

  it('refuses a decision on a proposal that changed after the card was posted', async () => {
    const card = await proposeInquiryUpdate();
    await handleProposeSourceDecision({
      id: card.id,
      proposedBy: 'Claude (agent)',
      proposedRecord: { ...event(), description: 'Something the editor never saw.' },
      });

    await expect(decide(card.id, card.proposalHash)).rejects.toThrow(
      'changed after it was put to the editor',
    );
    expect((await readEvent()).description).toBe(oldDescription);
    expect(readReview().status).toBe('pending_review');
  });

  it.each([
    [{ reviewer: 'Claude (agent)' }, 'must be one of'],
    [{ attestationUrl: 'https://example.com/said-go-ahead' }, 'decision card'],
  ])('refuses a decision that is not the editor tapping a card %j', async (override, message) => {
    const card = await proposeInquiryUpdate();

    await expect(decide(card.id, card.proposalHash, override)).rejects.toThrow(message);
    expect((await readEvent()).description).toBe(oldDescription);
  });

  it('refuses a staged capture older than 7 days', async () => {
    const card = await proposeInquiryUpdate();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);

    await expect(decide(card.id, card.proposalHash)).rejects.toThrow('more than 7 days old');
    expect((await readEvent()).description).toBe(oldDescription);
  });
});

describe('decide with the editor passkey', () => {
  function registerEditor() {
    const editor = softwarePasskey('Daniel Alkurdi');
    files.set('editor-passkeys.json', [editor.passkey]);
    return editor;
  }

  it('publishes on the editor passkey signature and records its owner as the reviewer', async () => {
    const editor = registerEditor();
    const card = await proposeInquiryUpdate();
    expect(card.approvalUrl).toBe(
      `https://policai.org/approve?subject=${encodeURIComponent(`source-review:${card.id}:${card.proposalHash}`)}`,
    );
    mailbox.push(editor.approve(approvalSubject({ kind: 'source-review', id: card.id, proposalHash: card.proposalHash })));

    const published = await handleRecordDecision({ id: card.id, proposalHash: card.proposalHash, reviewer: 'Someone Else' });

    expect(published.status).toBe('published');
    expect(published.decision).toMatchObject({ decidedBy: 'Daniel Alkurdi', decidedAt: '2026-10-30T01:00:00.000Z' });
    expect(published.decision?.approval?.subject).toBe(`source-review:${card.id}:${card.proposalHash}`);
    expect(published.decision?.attestationUrl).toBeUndefined();
    expect((await readEvent()).description).toBe(newDescription);
  });

  it('refuses a card link once a passkey is registered, and names the approve page', async () => {
    registerEditor();
    const card = await proposeInquiryUpdate();

    await expect(decide(card.id, card.proposalHash)).rejects.toThrow(card.approvalUrl);
    expect(readReview().status).toBe('pending_review');
  });

  it('refuses a signature from a key outside the registry', async () => {
    registerEditor();
    const card = await proposeInquiryUpdate();
    mailbox.push(softwarePasskey('Daniel Alkurdi').approve(
      approvalSubject({ kind: 'source-review', id: card.id, proposalHash: card.proposalHash }),
    ));

    await expect(handleRecordDecision({ id: card.id, proposalHash: card.proposalHash })).rejects.toThrow('registered editor passkey');
    expect(readReview().status).toBe('pending_review');
  });

  it('refuses a signature over an earlier version of the proposal', async () => {
    const editor = registerEditor();
    const card = await proposeInquiryUpdate();
    mailbox.push(editor.approve(approvalSubject({ kind: 'source-review', id: card.id, proposalHash: card.proposalHash })));
    await handleProposeSourceDecision({
      id: card.id,
      proposedBy: 'Claude (agent)',
      reviewedDate: { date: '2026-05-14', precision: 'day', notes: 'A later reading of the committee page gives 14 May 2026.' },
    });
    const changed = await handleShowSourceProposal({ id: card.id });

    await expect(handleRecordDecision({ id: card.id, proposalHash: changed.proposalHash })).rejects.toThrow('has not approved');
    await expect(handleRecordDecision({ id: card.id, proposalHash: card.proposalHash })).rejects.toThrow('changed');
  });

  it('publishes each proposal of a batch the editor signed once', async () => {
    const editor = registerEditor();
    const card = await proposeInquiryUpdate();
    const [batch] = await handleProposeSourceReviewBatch({ ids: [card.id] });
    const ledger = files.get('source-review-batches.json') as SourceReviewBatchLedger;
    expect(ledger.batches).toHaveLength(1);
    expect(ledger.batches[0].entries).toEqual([{ id: card.id, proposalHash: card.proposalHash }]);
    expect(batch.proposals.map((proposal) => proposal.id)).toEqual([card.id]);

    await expect(handleRecordDecision({ id: card.id, proposalHash: card.proposalHash, batchId: batch.id })).rejects.toThrow(batch.approvalUrl);
    mailbox.push(editor.approve(sourceReviewBatchSubject(ledger.batches[0])));
    const published = await handleRecordDecision({ id: card.id, proposalHash: card.proposalHash, batchId: batch.id });

    expect(published.status).toBe('published');
    expect(published.decision?.batch).toEqual({ id: batch.id, entries: ledger.batches[0].entries });
    expect((await readEvent()).description).toBe(newDescription);
  });

  it('refuses to batch a proposal that has blockers, and a decision the batch does not pin', async () => {
    registerEditor();
    const card = await proposeInquiryUpdate();
    const [batch] = await handleProposeSourceReviewBatch({ ids: [card.id] });

    await expect(handleRecordDecision({ id: card.id, proposalHash: 'b'.repeat(64), batchId: batch.id })).rejects.toThrow('does not include');
    await handleProposeSourceDecision({ id: card.id, proposedBy: 'Claude (agent)' });
    await expect(handleProposeSourceReviewBatch({ ids: [card.id] })).rejects.toThrow('cannot go to the editor yet');
  });
});
