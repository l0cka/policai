/**
 * Publish the Agentic AI addendum discovered during the 16 July 2026 manual
 * review of digital.gov.au.
 *
 * This intentionally exercises the same local stage -> approve -> publish
 * workflow exposed by the Policai MCP server. It is idempotent.
 */

import {
  getPolicyBySourceUrl,
  getSourceReviews,
} from '../src/lib/data-service';
import {
  approveStagedSource,
  publishStagedSource,
  stageSourceUrl,
} from '../src/lib/source-ingest';
import type { PolicyDraft } from '../src/types';

const SOURCE_URL =
  'https://www.digital.gov.au/policy/ai/agentic-ai-addendum';
const ACTOR = 'Policai editorial source review';
const DISCOVERED_AT = '2026-07-16T09:56:00.000Z';

const draft: PolicyDraft = {
  id: 'agentic-ai-addendum-technical-standard-2026',
  title:
    'Agentic AI addendum to the AI technical standard for Australian Government',
  description:
    'Australian Government best-practice standard for secure and governed implementation of agentic AI systems.',
  jurisdiction: 'federal',
  type: 'standard',
  status: 'active',
  dates: [
    {
      type: 'amended',
      date: '2026-06-04',
      precision: 'day',
      primary: true,
      source: {
        url: SOURCE_URL,
        title: 'Agentic AI addendum',
        publisher: 'Digital Transformation Agency',
        retrievedAt: DISCOVERED_AT,
        publishedAt: '2026-06-04',
      },
    },
  ],
  agencies: ['Digital Transformation Agency'],
  sourceUrl: SOURCE_URL,
  content:
    'The Agentic AI addendum provides best-practice guidance for Australian Government agencies exploring, developing or using agentic AI. It applies alongside the Australian Government AI technical standard and addresses agentic considerations across the AI lifecycle, including design, data, training, evaluation, integration, monitoring and decommissioning. The underlying technical-standard statements, criteria and general guidance continue to apply.',
  aiSummary:
    'DTA addendum extending the Australian Government AI technical standard with secure and governed agentic-AI implementation guidance.',
  tags: [
    'agentic AI',
    'AI agents',
    'technical standard',
    'AI lifecycle',
    'security',
    'governance',
  ],
  createdAt: DISCOVERED_AT,
  updatedAt: DISCOVERED_AT,
};

async function main() {
  const existingPolicy = await getPolicyBySourceUrl(SOURCE_URL, {
    access: 'admin',
  });
  let review = (await getSourceReviews()).find(
    (candidate) => candidate.sourceUrl === SOURCE_URL,
  );
  if (existingPolicy && (!review || review.status === 'published')) {
    console.log('Agentic AI addendum is already fully published.');
    return;
  }
  if (!review) {
    review = await stageSourceUrl({
      url: SOURCE_URL,
      entryKind: 'policy',
      actor: ACTOR,
      notes:
        'Discovered during the scheduled manual review of the digital.gov.au AI policy hub.',
    });
  }
  if (review.status === 'pending_review') {
    review = await approveStagedSource({
      id: review.id,
      actor: ACTOR,
      proposedRecord: draft,
      approvalNotes:
        'Checked against the official DTA page, including scope and the displayed 4 June 2026 last-updated date.',
    });
  }
  if (review.status === 'approved') {
    review = await publishStagedSource(review.id);
  }
  if (review.status !== 'published') {
    throw new Error(`Unexpected source-review status: ${review.status}`);
  }
  console.log(`Published ${draft.id} through source review ${review.id}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
