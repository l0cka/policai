/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { appendToApprovalMailbox } from './approval-mailbox';
import type { EditorApproval } from './approval-subject';

const MAILBOX = 'editor-approvals:data/editor-approvals.json';
const REVIEWS = 'main:data/source-reviews.json';
const RECONFIRMATIONS = 'main:data/reconfirmations.json';
const ONE_MB = 1024 * 1024;
const env = { POLICAI_SIGNAL_GITHUB_TOKEN: 'token' };

function signed(subject: string, padding = ''): EditorApproval {
  return {
    subject,
    receivedAt: '2026-10-31T05:00:00.000Z',
    response: { id: 'cred', authenticatorData: `ad${padding}`, clientDataJSON: 'cd', signature: `sig-${subject}` },
  };
}

function reviewSubject(id: string): string {
  return `source-review:${id}:${'a'.repeat(64)}`;
}

function review(id: string, status: string, approval?: EditorApproval, batch?: unknown) {
  return {
    id,
    status,
    ...(approval
      ? { decision: { proposalHash: 'a'.repeat(64), decidedBy: 'Daniel', decidedAt: approval.receivedAt, approval, batch } }
      : {}),
  };
}

const approval = signed(reviewSubject('source-review-a'));

function fakeGitHub(initial: Record<string, unknown> = {}, options: { mainFails?: boolean } = {}) {
  const files = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) files.set(key, JSON.stringify(value));
  const branches = new Set(['main']);
  if ([...files.keys()].some((key) => key.startsWith('editor-approvals:'))) branches.add('editor-approvals');
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.get('user-agent')) {
      return new Response('Request forbidden by administrative rules.', { status: 403 });
    }
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.pathname.endsWith('/git/refs') && method === 'POST') {
      branches.add(JSON.parse(String(init.body)).ref.replace('refs/heads/', ''));
      return Response.json({}, { status: 201 });
    }
    const ref = url.pathname.match(/\/git\/ref\/heads\/(.+)$/)?.[1];
    if (ref) {
      return branches.has(ref) ? Response.json({ object: { sha: 'main-sha' } }) : new Response('', { status: 404 });
    }
    const blob = url.pathname.match(/\/git\/blobs\/(.+)$/)?.[1];
    if (blob) {
      return Response.json({ encoding: 'base64', content: Buffer.from(files.get(blob) ?? '').toString('base64') });
    }
    const path = url.pathname.match(/\/contents\/(.+)$/)?.[1] ?? '';
    if (method === 'PUT') {
      const body = JSON.parse(String(init.body));
      files.set(`${body.branch}:${path}`, Buffer.from(body.content, 'base64').toString('utf8'));
      return Response.json({ commit: { sha: 'commit-sha' } }, { status: 201 });
    }
    const key = `${url.searchParams.get('ref')}:${path}`;
    if (options.mainFails && key.startsWith('main:')) {
      return new Response('upstream error', { status: 500 });
    }
    const text = files.get(key);
    if (text === undefined) return new Response('', { status: 404 });
    return Buffer.byteLength(text) > ONE_MB
      ? Response.json({ type: 'file', sha: key, encoding: 'none', content: '' })
      : Response.json({ type: 'file', sha: key, encoding: 'base64', content: Buffer.from(text).toString('base64') });
  }) as typeof fetch;
  const stored = () => JSON.parse(files.get(MAILBOX) ?? '[]') as EditorApproval[];
  return { fetchImpl, files, stored };
}

describe('appendToApprovalMailbox', () => {
  it('stores the first approval, creating the mailbox branch', async () => {
    const github = fakeGitHub();
    const result = await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(result).toEqual({ ok: true, commitSha: 'commit-sha' });
    expect(github.stored()).toEqual([approval]);
  });

  it('reports a second copy of the same signature as already stored', async () => {
    const github = fakeGitHub();
    await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl })).toEqual({
      ok: true,
      existing: true,
    });
  });

  it('appends to a mailbox that has grown past 1 MB', async () => {
    const earlier = Array.from({ length: 12 }, (_, index) =>
      signed(reviewSubject(`earlier-${index}`), 'x'.repeat(100_000)),
    );
    const github = fakeGitHub({ [MAILBOX]: earlier });
    expect(Buffer.byteLength(github.files.get(MAILBOX) ?? '')).toBeGreaterThan(ONE_MB);

    const result = await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(result).toEqual({ ok: true, commitSha: 'commit-sha' });
    expect(github.stored()).toEqual([...earlier, approval]);
  });

  it('drops the approvals that published decisions on main have consumed', async () => {
    const single = signed(reviewSubject('single'));
    const batchRef = { id: '2026-11-01-1', entries: [{ id: 'b1', proposalHash: 'a'.repeat(64) }, { id: 'b2', proposalHash: 'a'.repeat(64) }] };
    const batch = signed(`source-review-batch:${batchRef.id}:${'b'.repeat(64)}`);
    const reconfirm = signed(`reconfirm:2026-11-02-policy:${'c'.repeat(64)}`);
    const waiting = signed(reviewSubject('waiting'));
    const github = fakeGitHub({
      [MAILBOX]: [single, batch, waiting, reconfirm],
      [REVIEWS]: [
        review('single', 'published', single),
        review('b1', 'published', batch, batchRef),
        review('b2', 'published', batch, batchRef),
        review('waiting', 'pending_review'),
        { id: 'filler', status: 'rejected', notes: 'x'.repeat(ONE_MB) },
      ],
      [RECONFIRMATIONS]: { batches: [{ id: '2026-11-02-policy', decision: { approval: reconfirm } }] },
    });

    const result = await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(result).toEqual({ ok: true, commitSha: 'commit-sha' });
    expect(github.stored()).toEqual([waiting, approval]);
  });

  it('never drops an approval that no decision on main has consumed', async () => {
    const undecided = signed(reviewSubject('undecided'));
    const decidedNotPublished = signed(reviewSubject('decided-not-published'));
    const otherProposal = signed(`source-review:reproposed:${'d'.repeat(64)}`);
    const batchRef = { id: '2026-11-03-1', entries: [{ id: 'p1', proposalHash: 'a'.repeat(64) }, { id: 'p2', proposalHash: 'a'.repeat(64) }] };
    const partBatch = signed(`source-review-batch:${batchRef.id}:${'b'.repeat(64)}`);
    const openReconfirm = signed(`reconfirm:2026-11-03-policy:${'c'.repeat(64)}`);
    const pending = [undecided, decidedNotPublished, otherProposal, partBatch, openReconfirm];
    const github = fakeGitHub({
      [MAILBOX]: pending,
      [REVIEWS]: [
        review('undecided', 'pending_review'),
        review('decided-not-published', 'approved', decidedNotPublished),
        review('reproposed', 'published', signed(reviewSubject('reproposed'))),
        review('p1', 'published', partBatch, batchRef),
        review('p2', 'pending_review'),
      ],
      [RECONFIRMATIONS]: { batches: [{ id: '2026-11-03-policy' }] },
    });

    await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(github.stored()).toEqual([...pending, approval]);
  });

  it('keeps every approval when the decisions on main cannot be read', async () => {
    const single = signed(reviewSubject('single'));
    const github = fakeGitHub(
      { [MAILBOX]: [single], [REVIEWS]: [review('single', 'published', single)] },
      { mainFails: true },
    );

    const result = await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(result).toEqual({ ok: true, commitSha: 'commit-sha' });
    expect(github.stored()).toEqual([single, approval]);
  });
});
