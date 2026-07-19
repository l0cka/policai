/**
 * Record the manual-source coverage pass completed on 16 July 2026.
 *
 * The entries distinguish sources that were substantively checked from source
 * endpoints that were unavailable to both the collector and browser reviewer.
 */

import { recordManualSourceReview } from '../src/lib/source-ingest';
import type {
  ManualSourceReviewStatus,
  SourceEvidence,
} from '../src/types';

const REVIEWED_AT = '2026-07-16T10:15:00.000Z';
const ACTOR = 'Policai editorial source review';

interface ReviewInput {
  sourceId: string;
  status: ManualSourceReviewStatus;
  notes: string;
  evidence?: Omit<SourceEvidence, 'url'>;
}

const reviews: ReviewInput[] = [
  {
    sourceId: 'dta-media',
    status: 'source_unavailable',
    notes:
      'The official RSS endpoint could not be retrieved. The separate digital.gov.au AI policy hub was reviewed successfully in this coverage pass.',
  },
  {
    sourceId: 'digital-gov-ai',
    status: 'checked',
    notes:
      'Reviewed the current AI policy hub. The Agentic AI addendum was identified, verified and published through the stage-approve-publish workflow.',
    evidence: {
      title: 'Artificial intelligence in government',
      publisher: 'Digital Transformation Agency',
      finalUrl: 'https://www.digital.gov.au/policy/ai',
    },
  },
  {
    sourceId: 'disr-news',
    status: 'checked',
    notes:
      'Reviewed the current department news index; no additional discrete AI policy instrument requiring publication was identified.',
    evidence: {
      title: 'News',
      publisher: 'Department of Industry, Science and Resources',
    },
  },
  {
    sourceId: 'naic-news',
    status: 'checked',
    notes:
      'Reviewed the National AI Centre news and insights index; no additional register-ready government policy instrument was identified.',
    evidence: {
      title: 'News and insights',
      publisher: 'National AI Centre',
    },
  },
  {
    sourceId: 'finance-news',
    status: 'checked',
    notes:
      'Reviewed the Department of Finance latest-news index for AI governance and public-sector AI announcements.',
    evidence: {
      title: 'Latest News',
      publisher: 'Department of Finance',
    },
  },
  {
    sourceId: 'agd-news',
    status: 'source_unavailable',
    notes:
      'The official news and media endpoint was unavailable to the browser reviewer during this pass.',
  },
  {
    sourceId: 'esafety-media',
    status: 'checked',
    notes:
      'Reviewed the eSafety media-release index for AI-related regulatory and online-safety developments.',
    evidence: {
      title: 'Media releases',
      publisher: 'eSafety Commissioner',
    },
  },
  {
    sourceId: 'ahrc-media',
    status: 'checked',
    notes:
      'Reviewed the current media-centre updates; no new discrete AI policy development was identified.',
    evidence: {
      title: 'Media centre',
      publisher: 'Australian Human Rights Commission',
    },
  },
  {
    sourceId: 'fedcourt-practice-notes',
    status: 'checked',
    notes:
      'Reviewed the current practice-note index. GPN-AI remains listed at 16 April 2026 and no newer AI-specific practice note was identified.',
    evidence: {
      title: 'Practice Notes',
      publisher: 'Federal Court of Australia',
    },
  },
  {
    sourceId: 'qld-qgea-ai',
    status: 'source_unavailable',
    notes:
      'The official landing page returned an AWS WAF browser challenge rather than policy content. The source is now excluded from automatic success coverage.',
  },
  {
    sourceId: 'sa-office-for-ai',
    status: 'checked',
    notes:
      'Reviewed the Office for AI site. The AI-strategy consultation status and dates were reconciled in the register.',
    evidence: {
      title: 'Office for AI',
      publisher: 'Government of South Australia',
    },
  },
  {
    sourceId: 'tas-dpac-policies',
    status: 'checked',
    notes:
      'Reviewed the redirected Tasmanian policies and guidelines index for AI-specific instruments.',
    evidence: {
      title: 'Policies and guidelines',
      publisher: 'Department of Premier and Cabinet Tasmania',
      finalUrl:
        'https://www.dpac.tas.gov.au/government-information/governance-ministerial/policies-and-guidelines',
    },
  },
  {
    sourceId: 'act-ai-policy',
    status: 'checked',
    notes:
      'Reviewed the current ACT Government Artificial Intelligence Policy page.',
    evidence: {
      title: 'ACT Government Artificial Intelligence Policy',
      publisher: 'ACT Government',
    },
  },
  {
    sourceId: 'nt-ai-assurance',
    status: 'checked',
    notes:
      'Reviewed the current Northern Territory Artificial Intelligence Assurance Framework page and its redirect.',
    evidence: {
      title: 'Artificial Intelligence Assurance Framework',
      publisher: 'Northern Territory Government',
      finalUrl:
        'https://dcdd.nt.gov.au/publications/artificial-intelligence-assurance-framework',
    },
  },
];

async function main() {
  for (const review of reviews) {
    await recordManualSourceReview({
      ...review,
      actor: ACTOR,
      reviewedAt: REVIEWED_AT,
    });
  }
  console.log(`Recorded ${reviews.length} manual source reviews.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
