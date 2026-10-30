import {
  APPROVAL_MAILBOX_BRANCH,
  APPROVAL_MAILBOX_PATH,
  type EditorApproval,
} from '@/lib/editor-approval';

type Env = Readonly<Record<string, string | undefined>>;

export type MailboxResult =
  | { ok: true; commitSha?: string; existing?: true }
  | { ok: false; status: number; code: string; error: string };

interface GhContents {
  sha: string;
  content: string;
}

/**
 * Appends a verified approval to the mailbox branch. The branch holds only
 * signed approvals, so its integrity comes from the signatures, not from who
 * wrote it, and it never touches main or starts a deploy.
 */
export async function appendToApprovalMailbox(
  approval: EditorApproval,
  options: { env?: Env; fetchImpl?: typeof fetch } = {},
): Promise<MailboxResult> {
  const env = options.env ?? process.env;
  const token = env.POLICAI_SIGNAL_GITHUB_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      status: 503,
      code: 'github_token_unconfigured',
      error: 'POLICAI_SIGNAL_GITHUB_TOKEN is not configured; the approval was verified but not stored',
    };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const api = `https://api.github.com/repos/${env.POLICAI_SIGNAL_GITHUB_REPO?.trim() || 'l0cka/policai'}`;

  async function gh(pathname: string, init: RequestInit = {}) {
    return fetchImpl(`${api}${pathname}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
    });
  }

  async function readMailbox(): Promise<{ approvals: EditorApproval[]; sha?: string }> {
    const response = await gh(`/contents/${APPROVAL_MAILBOX_PATH}?ref=${APPROVAL_MAILBOX_BRANCH}`);
    if (response.status === 404) {
      const branch = await gh(`/git/ref/heads/${APPROVAL_MAILBOX_BRANCH}`);
      if (branch.status === 404) {
        const main = (await (await gh('/git/ref/heads/main')).json()) as { object: { sha: string } };
        const created = await gh('/git/refs', {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${APPROVAL_MAILBOX_BRANCH}`, sha: main.object.sha }),
        });
        if (!created.ok && created.status !== 422) {
          throw new Error(`creating ${APPROVAL_MAILBOX_BRANCH} failed (${created.status})`);
        }
      }
      return { approvals: [] };
    }
    if (!response.ok) throw new Error(`reading the mailbox failed (${response.status})`);
    const file = (await response.json()) as GhContents;
    return {
      approvals: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) as EditorApproval[],
      sha: file.sha,
    };
  }

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { approvals, sha } = await readMailbox();
      if (approvals.some((stored) => stored.response.signature === approval.response.signature)) {
        return { ok: true, existing: true };
      }
      const content = JSON.stringify([...approvals, approval], null, 2) + '\n';
      const written = await gh(`/contents/${APPROVAL_MAILBOX_PATH}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Editor approval: ${approval.subject}`,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch: APPROVAL_MAILBOX_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });
      if (written.ok) {
        const { commit } = (await written.json()) as { commit: { sha: string } };
        return { ok: true, commitSha: commit.sha };
      }
      if (written.status !== 409 && written.status !== 422) {
        throw new Error(`writing the mailbox failed (${written.status})`);
      }
    }
    return { ok: false, status: 409, code: 'mailbox_busy', error: 'The mailbox changed twice while writing; approve again' };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: 'github_persist_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
