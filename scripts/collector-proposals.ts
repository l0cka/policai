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

import { execFileSync } from 'child_process';
import { getCollectionMeta, getSourceHealth } from '../src/lib/data-service';
import {
  manualMoveProposals,
  manualProposalTitle,
  MANUAL_PROPOSAL_FAILURES,
  proposalIssueChanges,
  type UnreachedSource,
} from '../src/lib/pipeline/source-health';
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

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
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

  gh(['label', 'create', LABEL, '--force', '--color', 'd93f0b', '--description', 'Collector proposes moving a source to manual']);
  const openIssues = JSON.parse(
    gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '200', '--json', 'number,title']),
  ) as { number: number; title: string }[];
  const changes = proposalIssueChanges(proposals, openIssues);
  for (const proposal of changes.open) {
    const url = gh([
      'issue', 'create',
      '--label', LABEL,
      '--title', manualProposalTitle(proposal.sourceId),
      '--body', issueBody(proposal, lastErrors.get(proposal.sourceId)),
    ]).trim();
    console.log(`Opened ${url}`);
  }
  for (const number of changes.close) {
    gh(['issue', 'close', String(number), '--reason', 'not planned', '--comment',
      'The source succeeded again or is no longer automatic, so this proposal no longer applies.']);
    console.log(`Closed #${number}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
