/**
 * Replace two obsolete court landing-page URLs with current primary PDFs and
 * correct the Queensland record's overstated description.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type { Policy, SourceEvidence } from '../src/types';

const FILE = path.join(
  process.cwd(),
  'data',
  'policies.json',
);
const REVIEWED_AT = '2026-07-16T10:05:00.000Z';
const REVIEWER = 'Policai editorial source review';

function getPolicy(policies: Policy[], id: string): Policy {
  const policy = policies.find((candidate) => candidate.id === id);
  if (!policy) throw new Error(`Missing policy: ${id}`);
  return policy;
}

function verification(source: SourceEvidence, notes: string) {
  return {
    status: 'verified' as const,
    source,
    checkedAt: REVIEWED_AT,
    checkedBy: REVIEWER,
    method: 'manual' as const,
    notes,
  };
}

async function reconcileCourtSources() {
  const policies = await readJsonFile<Policy[]>(FILE, []);

  {
    const policy = getPolicy(policies, 'nsw-supreme-court-sc-gen-23');
    const sourceUrl =
      'https://supremecourt.nsw.gov.au/documents/Practice-and-Procedure/Practice-Notes/general/current/PN_SC_Gen_23.pdf';
    const source: SourceEvidence = {
      url: sourceUrl,
      finalUrl: sourceUrl,
      title: 'Supreme Court Practice Note SC Gen 23',
      publisher: 'Supreme Court of New South Wales',
      retrievedAt: '2026-07-16T10:01:23.046Z',
      publishedAt: '2025-01-28',
      contentType: 'application/pdf',
      contentHash:
        '8e87e71ecfcd9d3ada6cd1cf3ec8b3abd36e9dd2f51e68cc5c649db6eb01bbab',
      etag: '"29c3b-62cb79218cc80-gzip"',
      lastModified: 'Mon, 27 Jan 2025 22:26:42 GMT',
    };
    Object.assign(policy, {
      sourceUrl,
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verification(
        source,
        'Replaced the obsolete justice.nsw.gov.au URL with the current official PDF and checked the issue, commencement and substantive requirements.',
      ),
      effectiveDate: '2025-02-03',
      dates: [
        {
          type: 'commenced',
          date: '2025-02-03',
          precision: 'day',
          primary: true,
          source,
        },
        {
          type: 'issued',
          date: '2025-01-28',
          precision: 'day',
          source,
        },
      ],
    });
  }

  {
    const policy = getPolicy(
      policies,
      'qld-supreme-court-ai-practice-direction',
    );
    const sourceUrl =
      'https://www.courts.qld.gov.au/__data/assets/pdf_file/0010/882064/sc-pd-5-pf-2025.pdf';
    const source: SourceEvidence = {
      url: sourceUrl,
      finalUrl: sourceUrl,
      title:
        'Supreme Court of Queensland Practice Direction 5 of 2025 - Accuracy of References in Submissions',
      publisher: 'Supreme Court of Queensland',
      retrievedAt: '2026-07-16T10:01:22.769Z',
      publishedAt: '2025-09-24',
      contentType: 'application/pdf',
      contentHash:
        '400251380baf927c289d6c8e974b5d330b160904260f47b968670ccabc4b8a72',
    };
    Object.assign(policy, {
      title:
        'Practice Direction 5 of 2025 - Accuracy of References in Submissions',
      description:
        'Queensland Supreme Court practice direction requiring named responsibility for submissions and verification of references, addressing risks from generative-AI hallucinations.',
      sourceUrl,
      content:
        'Practice Direction 5 of 2025 addresses the risk that generative AI may produce inaccurate or fictitious cases, legislation and other references, or inadequately checked language in submissions. It requires the responsible person for written and oral submissions to be identified, requires legal practitioners to verify the accuracy and relevance of references and exercise their own professional judgment, and tells self-represented litigants to verify references using authoritative legal resources. It warns that non-existent references may result in professional referral, personal costs consequences, adjournment or adverse costs.',
      aiSummary:
        'Queensland Supreme Court direction requiring accountable authorship and verification of references in submissions because of generative-AI hallucination risk.',
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verification(
        source,
        'Replaced a dead landing-page URL with the primary PDF and removed unsupported claims that the direction requires general AI-use disclosure for affidavits and expert reports.',
      ),
      effectiveDate: '2025-09-24',
      dates: [
        {
          type: 'issued',
          date: '2025-09-24',
          precision: 'day',
          primary: true,
          source,
        },
      ],
    });
  }

  await writeJsonFile(FILE, policies);
  console.log('Reconciled NSW and Queensland court source links and content.');
}

async function main() {
  await withDataMutationLock(reconcileCourtSources);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
