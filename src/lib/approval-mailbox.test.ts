/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { appendToApprovalMailbox } from './approval-mailbox';
import type { EditorApproval } from './approval-subject';

const approval: EditorApproval = {
  subject: `source-review:source-review-a:${'a'.repeat(64)}`,
  receivedAt: '2026-10-31T05:00:00.000Z',
  response: { id: 'cred', authenticatorData: 'ad', clientDataJSON: 'cd', signature: 'sig' },
};

/** GitHub's contents API as it behaves before the mailbox branch exists. */
function fakeGitHub() {
  const files = new Map<string, string>();
  const branches = new Set(['main']);
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
    if (method === 'PUT') {
      const body = JSON.parse(String(init.body));
      files.set(body.branch, body.content);
      return Response.json({ commit: { sha: 'commit-sha' } }, { status: 201 });
    }
    const content = files.get(url.searchParams.get('ref') ?? '');
    return content ? Response.json({ sha: 'file-sha', content }) : new Response('', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, files };
}

describe('appendToApprovalMailbox', () => {
  it('stores the first approval, creating the mailbox branch', async () => {
    const github = fakeGitHub();
    const result = await appendToApprovalMailbox(approval, {
      env: { POLICAI_SIGNAL_GITHUB_TOKEN: 'token' },
      fetchImpl: github.fetchImpl,
    });

    expect(result).toEqual({ ok: true, commitSha: 'commit-sha' });
    const stored = JSON.parse(Buffer.from(github.files.get('editor-approvals') ?? '', 'base64').toString('utf8'));
    expect(stored).toEqual([approval]);
  });

  it('reports a second copy of the same signature as already stored', async () => {
    const github = fakeGitHub();
    const env = { POLICAI_SIGNAL_GITHUB_TOKEN: 'token' };
    await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl });

    expect(await appendToApprovalMailbox(approval, { env, fetchImpl: github.fetchImpl })).toEqual({
      ok: true,
      existing: true,
    });
  });
});
