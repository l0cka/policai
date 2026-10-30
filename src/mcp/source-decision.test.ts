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
vi.mock('@/lib/data-lock', () => ({
  withDataMutationLock: async (run: () => Promise<unknown>) => run(),
}));
import {
  handleProposeSourceDecision,
  handleRecordDecision,
  handleShowSourceProposal,
  handleStageSourceCapture,
} from './tool-handlers';
import { getTimelineEvents } from '@/lib/data-service';

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
      'changed after its decision card was posted',
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
