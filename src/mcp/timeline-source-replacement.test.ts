/* @vitest-environment node */
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy, buildTimelineEvent } from '@/test/factories';
import type { SourceReview } from '@/types';

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
import { handleStageSourceCapture, handleApproveStagedSource, handlePublishStagedSource } from './tool-handlers';
import { getSourceReviews, getTimelineEvents } from '@/lib/data-service';
import { validateSourceReviews } from '@/lib/validate-data';

const oldUrl = 'https://example.gov.au/index';
const newUrl = 'https://example.gov.au/instrument';
let adminToken: string;
const capture = () => ({
  pageTitle: 'Official AI instrument',
  pageText: 'This official instrument commences on 1 July 2026 and governs artificial intelligence.',
  references: [],
  capturedAt: new Date().toISOString(),
  capturedBy: 'Fixture Reviewer',
  notes: 'Read the official instrument and verified its commencement date.',
  linkedDocuments: [],
});
const event = () => buildTimelineEvent({ id: 'tracked-event', sourceUrl: oldUrl, date: '2026-07-01', datePrecision: 'day' });
const readEvent = async () => (await getTimelineEvents(undefined, { access: 'admin', includeGenerated: false }))[0];
const stage = (extra: Record<string, unknown> = {}) => handleStageSourceCapture({
  url: newUrl, entryKind: 'timeline_event', targetRecordId: 'tracked-event',
  replaceTargetSource: true, proposedRecord: { ...event(), sourceUrl: newUrl },
  capture: capture(), adminToken, ...extra,
});
const approve = (id: string, extra: Record<string, unknown> = {}) => handleApproveStagedSource({
  id, reviewer: 'Fixture Reviewer', browserCapture: capture(), adminToken,
  reviewedDate: { date: '2026-07-01', precision: 'day', notes: 'The instrument expressly states commencement on 1 July 2026.' },
  ...extra,
});
const publish = (id: string) => handlePublishStagedSource({ id, browserCapture: capture(), adminToken });

beforeEach(() => {
  files.clear();
  files.set(basename('data/timeline.json'), [event()]);
  adminToken = randomUUID();
  vi.stubEnv('POLICAI_MCP_ADMIN_TOKEN', adminToken);
});
afterEach(() => vi.unstubAllEnvs());

describe('timeline source replacement through real MCP handlers', () => {
  it('refuses approval when previous source provenance is missing or wrong', async () => {
    const staged = await stage();
    for (const previousUrl of [undefined, 'https://example.gov.au/wrong']) {
      files.set('source-reviews.json', [{ ...staged, targetTimelineEventPreviousSourceUrl: previousUrl }]);
      await expect(approve(staged.id)).rejects.toThrow('source URL does not match the target event');
    }
  });

  it.each([
    { replaceTargetSource: false }, { targetRecordId: undefined },
    { proposedRecord: undefined }, { targetRecordId: 'missing' },
    { url: oldUrl },
    { proposedRecord: { ...event(), id: 'different', sourceUrl: newUrl } },
    { proposedRecord: { ...event(), sourceUrl: oldUrl } },
  ])('refuses incomplete or mismatched replacement staging %j', async (override) => {
    await expect(stage(override)).rejects.toThrow();
    expect(await getSourceReviews()).toEqual([]);
    expect((await readEvent()).sourceUrl).toBe(oldUrl);
  });

  it.each(['stage', 'approve', 'publish'])('rejects unrelated policy collisions at %s', async (phase) => {
    const policy = buildPolicy({ id: 'unrelated', sourceUrl: newUrl });
    if (phase === 'stage') files.set('policies.json', [policy]);
    if (phase === 'stage') { await expect(stage()).rejects.toThrow('identity owned'); return; }
    const staged = await stage();
    if (phase === 'approve') files.set('policies.json', [policy]);
    if (phase === 'approve') { await expect(approve(staged.id)).rejects.toThrow('already used'); return; }
    await approve(staged.id);
    files.set('policies.json', [policy]);
    await expect(publish(staged.id)).rejects.toThrow('owned by another');
    expect((await readEvent()).sourceUrl).toBe(oldUrl);
  });

  it.each(['timeline', 'pending-policy-review', 'unrelated-published-review'])('does not exempt %s collisions beside the related policy', async (kind) => {
    const policy = buildPolicy({ id: 'related-policy', sourceUrl: newUrl });
    const target = { ...event(), relatedPolicyId: policy.id };
    files.set('policies.json', [policy]);
    files.set('timeline.json', kind === 'timeline' ? [target, buildTimelineEvent({ id: 'other', sourceUrl: newUrl })] : [target]);
    if (kind !== 'timeline') files.set('source-reviews.json', [{
      id: 'other-review', entryKind: 'policy', status: kind === 'pending-policy-review' ? 'pending_review' : 'published',
      sourceUrl: newUrl, sourceEvidence: { url: newUrl },
      proposedRecord: { ...policy, id: kind === 'pending-policy-review' ? policy.id : 'unrelated' },
    }]);
    await expect(stage({ proposedRecord: { ...target, sourceUrl: newUrl } })).rejects.toThrow('identity owned');
  });

  it('does not treat a related policy redirect alias as its canonical source', async () => {
    const policy = buildPolicy({ id: 'related-policy', sourceUrl: 'https://example.gov.au/canonical' });
    policy.verification.source = { url: policy.sourceUrl, finalUrl: newUrl };
    files.set('policies.json', [policy]);
    files.set('timeline.json', [{ ...event(), relatedPolicyId: policy.id }]);
    await expect(stage({ proposedRecord: { ...event(), sourceUrl: newUrl, relatedPolicyId: policy.id } })).rejects.toThrow('identity owned');
  });

  it.each(['approve', 'publish'])('rejects a late unrelated staged identity at %s despite the related policy exception', async (phase) => {
    const policy = buildPolicy({ id: 'related-policy', sourceUrl: newUrl });
    files.set('policies.json', [policy]);
    files.set('timeline.json', [{ ...event(), relatedPolicyId: policy.id }]);
    const staged = await stage({ proposedRecord: { ...event(), sourceUrl: newUrl, relatedPolicyId: policy.id } });
    if (phase === 'publish') await approve(staged.id);
    files.set('source-reviews.json', [...await getSourceReviews(), {
      ...staged, id: 'unrelated-review', targetTimelineEventId: undefined,
      sourceUrl: newUrl, proposedRecord: { ...staged.proposedRecord, id: 'unrelated' },
    }]);
    await expect(phase === 'approve' ? approve(staged.id) : publish(staged.id)).rejects.toThrow(phase === 'approve' ? 'already used' : 'owned by another');
  });

  it('does not let a replacement invent its related policy relationship', async () => {
    const policy = buildPolicy({ id: 'unrelated', sourceUrl: newUrl });
    files.set('policies.json', [policy]);
    await expect(stage({ proposedRecord: { ...event(), sourceUrl: newUrl, relatedPolicyId: policy.id } })).rejects.toThrow('identity owned');
  });

  it('keeps target revisions and capture fingerprints binding at approval and publication', async () => {
    const staged = await stage();
    files.set('timeline.json', [{ ...event(), title: 'Edited since staging' }]);
    await expect(approve(staged.id)).rejects.toThrow('changed after');
    files.set('timeline.json', [event()]);
    await expect(approve(staged.id, { reviewer: 'Someone else' })).rejects.toThrow();
    await approve(staged.id);
    files.set('timeline.json', [{ ...event(), title: 'Edited after approval' }]);
    await expect(publish(staged.id)).rejects.toThrow('already exists');
    files.set('timeline.json', [event()]);
    await expect(handlePublishStagedSource({ id: staged.id, adminToken, browserCapture: { ...capture(), pageText: 'Changed official source text that must require a new review.' } })).rejects.toThrow();
    expect((await readEvent()).sourceUrl).toBe(oldUrl);
  });

  it('refreshes the pending review in place and retains older published and superseded history', async () => {
    const initial = await stage({ url: oldUrl, replaceTargetSource: false, proposedRecord: { ...event() } });
    await approve(initial.id);
    const historical = await publish(initial.id);
    const pending: SourceReview = { ...historical, id: 'pending', status: 'pending_review', sourceVersionSequence: 3 };
    const olderPending: SourceReview = { ...pending, id: 'older-pending', sourceVersionSequence: 2 };
    files.set('source-reviews.json', [pending, olderPending, { ...historical, sourceVersionSequence: 1 }]);
    const staged = await stage();
    expect(staged).toMatchObject({ id: 'pending', sourceVersionSequence: 3, status: 'pending_review', targetTimelineEventPreviousSourceUrl: oldUrl });
    await approve(staged.id);
    await publish(staged.id);
    const reviews = await getSourceReviews();
    expect(reviews.find((r) => r.id === initial.id)?.status).toBe('published');
    expect(reviews.find((r) => r.id === 'older-pending')).toMatchObject({ status: 'rejected', rejectionReason: 'Superseded by newer source update pending' });
    expect(validateSourceReviews(reviews, { policies: [], timelineEvents: [await readEvent()] }).errors).toEqual([]);
  });

  it('keeps policy replacement working through the same handlers', async () => {
    const policy = buildPolicy({ sourceUrl: oldUrl, effectiveDate: '2026-07-01' });
    files.set('policies.json', [policy]);
    files.set('timeline.json', []);
    const staged = await stage({ entryKind: 'policy', targetRecordId: policy.id, proposedRecord: { ...policy, sourceUrl: newUrl, dates: policy.dates.map((date) => ({ ...date, source: undefined })) } });
    expect(staged).toMatchObject({ targetPolicyPreviousSourceUrl: oldUrl, targetPolicyId: policy.id });
    expect(staged.targetTimelineEventPreviousSourceUrl).toBeUndefined();
    await approve(staged.id);
    await publish(staged.id);
    expect(files.get('policies.json')).toMatchObject([{ id: policy.id, sourceUrl: newUrl }]);
  });

  it('recovers a partial canonical write without duplicating the event', async () => {
    const staged = await stage();
    const approved = await approve(staged.id);
    files.set('timeline.json', [approved.proposedRecord]);
    await expect(publish(staged.id)).resolves.toMatchObject({ status: 'published' });
    expect(files.get('timeline.json')).toHaveLength(1);
  });

  it('allows replacement by the existing related policy canonical source, including its published review', async () => {
    const policy = buildPolicy({ id: 'related-policy', sourceUrl: newUrl });
    files.set('policies.json', [policy]);
    files.set('timeline.json', [{ ...event(), relatedPolicyId: policy.id }]);
    files.set('source-reviews.json', [{
      id: 'policy-history', entryKind: 'policy', status: 'published',
      sourceUrl: newUrl, sourceEvidence: { url: newUrl }, proposedRecord: policy,
    }]);
    const staged = await stage({ proposedRecord: { ...event(), relatedPolicyId: policy.id, sourceUrl: newUrl } });
    await approve(staged.id);
    await publish(staged.id);
    expect(await readEvent()).toMatchObject({ sourceUrl: newUrl, relatedPolicyId: policy.id });
    expect(files.get('policies.json')).toEqual([policy]);
  });
  it('stages, approves and publishes in place with explicit previous URL provenance', async () => {
    const staged = await stage();
    expect(staged).toMatchObject({ status: 'pending_review', targetTimelineEventId: 'tracked-event', targetTimelineEventPreviousSourceUrl: oldUrl });
    expect((await readEvent()).sourceUrl).toBe(oldUrl);
    await expect(publish(staged.id)).rejects.toThrow('explicitly approved');
    const approved = await approve(staged.id);
    expect(approved.status).toBe('approved');
    expect((await readEvent()).sourceUrl).toBe(oldUrl);
    const published = await publish(staged.id);
    expect(published.status).toBe('published');
    expect(await readEvent()).toMatchObject({ id: 'tracked-event', sourceUrl: newUrl, date: '2026-07-01' });
    expect(validateSourceReviews(await getSourceReviews(), { policies: [], timelineEvents: [await readEvent()] }).errors).toEqual([]);
    await expect(publish(staged.id)).resolves.toMatchObject({ status: 'published' });
    expect(files.get('timeline.json')).toHaveLength(1);
  });
});
