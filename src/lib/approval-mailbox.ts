import {
  APPROVAL_MAILBOX_BRANCH,
  APPROVAL_MAILBOX_PATH,
  type EditorApproval,
} from '@/lib/editor-approval';
import { GitHubError, readGitHubFile } from '@/lib/github-file';
import { COLLECTOR_USER_AGENT } from '@/lib/pipeline/identity';

type Env = Readonly<Record<string, string | undefined>>;

export type MailboxResult =
  | { ok: true; commitSha?: string; existing?: true }
  | { ok: false; status: number; code: string; error: string };

const SOURCE_REVIEWS_PATH = 'data/source-reviews.json';
const RECONFIRMATIONS_PATH = 'data/reconfirmations.json';

interface DecidedReview {
  id: string;
  status: string;
  decision?: {
    proposalHash: string;
    approval?: { subject: string };
    batch?: { entries: Array<{ id: string; proposalHash: string }> };
  };
}

interface DecidedReconfirmations {
  batches: Array<{ decision?: { approval?: { subject: string } } }>;
}

function consumedSubjects(
  reviews: readonly DecidedReview[],
  reconfirmations: DecidedReconfirmations,
): Set<string> {
  const consumed = new Set<string>();
  const published = new Set<string>();
  const batches = new Map<string, Array<{ id: string; proposalHash: string }>>();
  for (const { id, status, decision } of reviews) {
    const subject = decision?.approval?.subject;
    if (status !== 'published' || !decision || !subject) continue;
    if (decision.batch) {
      published.add(`${subject} ${id} ${decision.proposalHash}`);
      batches.set(subject, decision.batch.entries);
    } else {
      consumed.add(subject);
    }
  }
  for (const [subject, entries] of batches) {
    if (entries.every((entry) => published.has(`${subject} ${entry.id} ${entry.proposalHash}`))) {
      consumed.add(subject);
    }
  }
  for (const batch of reconfirmations.batches) {
    const subject = batch.decision?.approval?.subject;
    if (subject) consumed.add(subject);
  }
  return consumed;
}

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
        'User-Agent': COLLECTOR_USER_AGENT,
      },
    });
  }

  async function get<T>(pathname: string): Promise<T> {
    const response = await gh(pathname);
    if (!response.ok) {
      throw new GitHubError(
        response.status,
        `GitHub GET ${pathname} failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  async function readMailbox(): Promise<{ approvals: EditorApproval[]; sha?: string }> {
    const file = await readGitHubFile(get, APPROVAL_MAILBOX_PATH, APPROVAL_MAILBOX_BRANCH);
    if (file) return { approvals: JSON.parse(file.text) as EditorApproval[], sha: file.sha };
    const branch = await gh(`/git/ref/heads/${APPROVAL_MAILBOX_BRANCH}`);
    if (branch.status === 404) {
      const main = await get<{ object: { sha: string } }>('/git/ref/heads/main');
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

  async function withoutConsumed(approvals: EditorApproval[]): Promise<EditorApproval[]> {
    if (approvals.length === 0) return approvals;
    try {
      const [reviews, reconfirmations] = await Promise.all([
        readGitHubFile(get, SOURCE_REVIEWS_PATH, 'main'),
        readGitHubFile(get, RECONFIRMATIONS_PATH, 'main'),
      ]);
      const consumed = consumedSubjects(
        reviews ? (JSON.parse(reviews.text) as DecidedReview[]) : [],
        reconfirmations ? (JSON.parse(reconfirmations.text) as DecidedReconfirmations) : { batches: [] },
      );
      return approvals.filter((stored) => !consumed.has(stored.subject));
    } catch (error) {
      console.warn(
        `Approvals mailbox not pruned: ${error instanceof Error ? error.message : String(error)}`,
      );
      return approvals;
    }
  }

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { approvals, sha } = await readMailbox();
      if (approvals.some((stored) => stored.response.signature === approval.response.signature)) {
        return { ok: true, existing: true };
      }
      const content = JSON.stringify([...(await withoutConsumed(approvals)), approval], null, 2) + '\n';
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
        throw new Error(`writing the mailbox failed (${written.status}): ${(await written.text()).slice(0, 200)}`);
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
