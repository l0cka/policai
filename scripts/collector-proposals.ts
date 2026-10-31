/**
 * Lists automatic sources that failed three collection runs in a row, as
 * proposals to move them to manual. Nothing moves on its own: a person
 * decides on a decision card in the Policai project, and the move is then
 * recorded as a ManualDecision in src/lib/pipeline/sources.ts.
 *
 * Usage:
 *   npm run collector:proposals
 *   npm run collector:proposals -- --sync-issues   # one open GitHub issue per proposal
 */

import { getCollectionMeta, getSourceHealth } from '../src/lib/data-service';
import {
  manualMoveProposals,
  manualProposalTitle,
  MANUAL_PROPOSAL_FAILURES,
  proposalIssueChanges,
  type UnreachedSource,
} from '../src/lib/pipeline/source-health';
import { COLLECTOR_USER_AGENT } from '../src/lib/pipeline/identity';
import { getAutomaticSources, getSourceById } from '../src/lib/pipeline/sources';

const LABEL = 'collector-proposal';

function issueBody(proposal: UnreachedSource, lastError: string | undefined): string {
  const source = getSourceById(proposal.sourceId);
  return [
    `**${source?.name ?? proposal.sourceId}** (\`${proposal.sourceId}\`) has failed ${proposal.consecutiveFailures} collection runs in a row.`,
    '',
    `- Page: ${source?.url ?? 'unknown'}`,
    `- Failing since: ${proposal.firstFailureAt}`,
    `- Last success: ${proposal.lastSuccessAt ?? 'never'}`,
    `- Failure class: ${proposal.lastFailureClass ?? 'unknown'}`,
    ...(lastError ? [`- Last error: ${lastError}`] : []),
    '',
    `The collector proposes moving it to manual after ${MANUAL_PROPOSAL_FAILURES} failed runs. ` +
      'Nothing moves on its own: the decision is made on a decision card in the Policai project. ' +
      'This issue closes by itself once the source succeeds again or leaves the automatic catalogue.',
  ].join('\n');
}

// Calls the REST API directly rather than the gh CLI, which the self-hosted
// runners do not have.
async function github<T>(method: string, pathname: string, body?: unknown): Promise<T> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error('--sync-issues needs GH_TOKEN and GH_REPO');
  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': COLLECTOR_USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function ensureLabel() {
  const label = { color: 'd93f0b', description: 'Collector proposes moving a source to manual' };
  try {
    await github('PATCH', `/labels/${LABEL}`, label);
  } catch {
    await github('POST', '/labels', { name: LABEL, ...label });
  }
}

async function main() {
  const [ledger, meta] = await Promise.all([getSourceHealth(), getCollectionMeta()]);
  const proposals = manualMoveProposals(
    ledger,
    getAutomaticSources().map((source) => source.id),
  );
  const lastErrors = new Map(
    meta.collector.sourceResults.flatMap((result) =>
      result.error ? [[result.sourceId, result.error] as const] : [],
    ),
  );

  if (proposals.length === 0) console.log('No automatic source has failed three runs in a row.');
  for (const proposal of proposals) {
    console.log(
      `${proposal.sourceId}: ${proposal.consecutiveFailures} failed runs since ${proposal.firstFailureAt} (${proposal.lastFailureClass ?? 'unknown'})`,
    );
  }
  if (!process.argv.includes('--sync-issues')) return;

  await ensureLabel();
  const openIssues = (
    await github<{ number: number; title: string; pull_request?: unknown }[]>(
      'GET',
      `/issues?labels=${LABEL}&state=open&per_page=100`,
    )
  ).filter((issue) => !issue.pull_request);
  const changes = proposalIssueChanges(proposals, openIssues);
  for (const proposal of changes.open) {
    const issue = await github<{ html_url: string }>('POST', '/issues', {
      labels: [LABEL],
      title: manualProposalTitle(proposal.sourceId),
      body: issueBody(proposal, lastErrors.get(proposal.sourceId)),
    });
    console.log(`Opened ${issue.html_url}`);
  }
  for (const number of changes.close) {
    await github('POST', `/issues/${number}/comments`, {
      body: 'The source succeeded again or is no longer automatic, so this proposal no longer applies.',
    });
    await github('PATCH', `/issues/${number}`, { state: 'closed', state_reason: 'not_planned' });
    console.log(`Closed #${number}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
