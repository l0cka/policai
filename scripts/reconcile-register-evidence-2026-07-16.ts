/**
 * Idempotent editorial reconciliation of eight register records whose
 * provenance was incomplete during the structured-evidence migration.
 *
 * The changes below are grounded in the official sources reviewed on
 * 16 July 2026. Keep this script as an auditable explanation of the material
 * date, status, source and classification corrections.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type {
  Policy,
  PolicyDate,
  RecordVerification,
  SourceEvidence,
} from '../src/types';

const POLICIES_FILE = path.join(
  process.cwd(),
  'data',
  'policies.json',
);
const REVIEWED_AT = '2026-07-16T10:00:00.000Z';
const REVIEWER = 'Policai editorial source review';

function evidence(
  url: string,
  options: Omit<SourceEvidence, 'url'> = {},
): SourceEvidence {
  return {
    url,
    retrievedAt: REVIEWED_AT,
    ...options,
  };
}

function verified(
  source: SourceEvidence,
  notes: string,
): RecordVerification {
  return {
    status: 'verified',
    source,
    checkedAt: REVIEWED_AT,
    checkedBy: REVIEWER,
    method: 'manual',
    notes,
  };
}

function date(
  type: PolicyDate['type'],
  value: string,
  precision: PolicyDate['precision'],
  source: SourceEvidence,
  primary = false,
): PolicyDate {
  return { type, date: value, precision, primary: primary || undefined, source };
}

function requirePolicy(policies: Policy[], id: string): Policy {
  const policy = policies.find((candidate) => candidate.id === id);
  if (!policy) throw new Error(`Missing policy: ${id}`);
  return policy;
}

async function reconcileRegisterEvidence() {
  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);

  {
    const policy = requirePolicy(
      policies,
      'asd-blueprint-secure-cloud-ai-usage-policy',
    );
    const sourceUrl =
      'https://blueprint.asd.gov.au/security-and-governance/policies/';
    const source = evidence(sourceUrl, {
      finalUrl: sourceUrl,
      title: 'Organisational policies and strategies',
      publisher: 'Australian Signals Directorate',
      contentType: 'text/html',
      contentHash:
        'a2f461921f4e53cc1dca8231ee4eaf0ef8f71117e8e44ebd842b11373e7ad0e1',
    });
    const changelog = evidence('https://blueprint.asd.gov.au/changelog/', {
      title: 'Change log',
      publisher: 'Australian Signals Directorate',
    });
    Object.assign(policy, {
      sourceUrl,
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The direct ASD checklist states that a general-purpose AI usage policy is required by ISM-2074; the Blueprint changelog supports the launch and latest revision dates.',
      ),
      dates: [
        date('published', '2023-12-19', 'day', changelog, true),
        date('amended', '2026-04-20', 'day', changelog),
      ],
      effectiveDate: '2023-12-19',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'implementation-plan-policy-responsible-use-ai-government-2025',
    );
    const sourceUrl =
      'https://www.dataanddigital.gov.au/implementation-plan/2025/artificial-intelligence';
    const source = evidence(sourceUrl, {
      title: 'Artificial intelligence | Data and Digital',
      publisher: 'Australian Government',
    });
    const versionHistory = evidence(
      'https://www.dataanddigital.gov.au/version-history',
      {
        title: 'Version history | Data and Digital',
        publisher: 'Australian Government',
        publishedAt: '2024-12-13',
      },
    );
    Object.assign(policy, {
      content:
        "The 2025 Implementation Plan's artificial intelligence chapter summarises how the APS is accelerating AI adoption, lifting workforce capability, implementing the AI Plan for the Australian Public Service, and applying the updated AI in government policy, impact assessment tool, and technical standard. The official version history records the second Implementation Plan as published on 13 December 2024.",
      aiSummary:
        '2025 implementation-plan chapter covering APS AI adoption, governance and enabling actions, published as part of the second Implementation Plan on 13 December 2024.',
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The chapter content was checked against the official page. The unsupported 17 November 2025 amendment claim was removed; the official version history dates the second plan to 13 December 2024.',
      ),
      dates: [
        date('published', '2024-12-13', 'day', versionHistory, true),
      ],
      effectiveDate: '2024-12-13',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'government-response-privacy-act-review-report',
    );
    const sourceUrl =
      'https://www.ag.gov.au/rights-and-protections/publications/government-response-privacy-act-review-report';
    const source = evidence(sourceUrl, {
      title: 'Government response to the Privacy Act Review Report',
      publisher: "Attorney-General's Department",
      publishedAt: '2023-09-28',
    });
    Object.assign(policy, {
      type: 'policy',
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The official publication page supports the release date, page update date and continuing relationship to automated decision-making privacy reform.',
      ),
      dates: [
        date('published', '2023-09-28', 'day', source, true),
        date('amended', '2025-03-12', 'day', source),
      ],
      effectiveDate: '2023-09-28',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'queensland-use-of-generative-ai-in-government',
    );
    const sourceUrl =
      'https://www.forgov.qld.gov.au/__data/assets/pdf_file/0028/416647/Use-of-generative-AI-in-government-v1.0.1.pdf';
    const source = evidence(sourceUrl, {
      title: 'Use of generative AI in government',
      publisher:
        'Queensland Department of Customer Services, Open Data and Small and Family Business',
      publishedAt: '2025-07-01',
      contentType: 'application/pdf',
    });
    Object.assign(policy, {
      title: 'Use of generative AI in government',
      description:
        'Queensland Government Enterprise Architecture fact sheet on safe and appropriate use of commercial generative AI tools in government work.',
      sourceUrl,
      content:
        'This current Queensland Government Enterprise Architecture fact sheet is version 1.0.1, dated July 2025. It applies existing Queensland Government obligations to commercial generative AI use and gives practical guidance on privacy and security, accuracy, legal risk, ethics and transparency, accountability, recordkeeping, risk assessment and human review of outputs.',
      aiSummary:
        'Queensland whole-of-government fact sheet for safe use of commercial generative AI tools, version 1.0.1 dated July 2025.',
      tags: [
        'Queensland',
        'generative AI',
        'fact sheet',
        'QGEA',
        'public sector',
      ],
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The former August 2023 date could not be substantiated on the protected landing page. The record now points to and describes the current official v1.0.1 PDF dated July 2025.',
      ),
      dates: [date('amended', '2025-07-01', 'month', source, true)],
      effectiveDate: '2025-07-01',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'sa-artificial-intelligence-ethics-policy',
    );
    const sourceUrl =
      'https://www.treasury.sa.gov.au/__data/assets/pdf_file/0004/1194340/AI_Ethics_Policy.pdf';
    const source = evidence(sourceUrl, {
      title: 'Artificial Intelligence Ethics Policy',
      publisher: 'Government of South Australia',
      publishedAt: '2025-10-10',
      contentType: 'application/pdf',
    });
    Object.assign(policy, {
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'Document control confirms version 1.0, mandatory compliance and approval on 10 October 2025.',
      ),
      dates: [date('approved', '2025-10-10', 'day', source, true)],
      effectiveDate: '2025-10-10',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'sa-guideline-use-of-generative-ai-and-llm-tools',
    );
    const sourceUrl =
      'https://www.treasury.sa.gov.au/__data/assets/pdf_file/0007/936745/Guideline-13.1-Use-of-Large-Language-Model-AI-Tools-Utilities.pdf';
    const source = evidence(sourceUrl, {
      title:
        'Guideline for the use of Generative Artificial Intelligence and Large Language Model Tools',
      publisher: 'Government of South Australia',
      publishedAt: '2026-02-17',
      contentType: 'application/pdf',
    });
    Object.assign(policy, {
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'Document control confirms version 1.4 FINAL, approval on 17 February 2026 and an original approval date of 31 May 2023.',
      ),
      dates: [date('approved', '2026-02-17', 'day', source, true)],
      effectiveDate: '2026-02-17',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'sa-ai-for-better-government-discussion-paper',
    );
    const sourceUrl =
      'https://www.ai.sa.gov.au/artificial-intelligence-ai-strategy-for-the-south-australian-government';
    const source = evidence(sourceUrl, {
      title:
        'Artificial Intelligence (AI) strategy for the South Australian government',
      publisher: 'Office for AI, Government of South Australia',
      publishedAt: '2026-01-29',
    });
    Object.assign(policy, {
      status: 'closed',
      sourceUrl,
      content:
        'The South Australian Government consulted on a whole-of-government artificial intelligence strategy using a January 2026 discussion paper. The official consultation page says contributions opened on 29 January 2026 and closed on 20 February 2026. Feedback is under review and will inform a final strategy planned for release later in 2026.',
      aiSummary:
        'Closed South Australian consultation on a whole-of-government AI strategy; contributions ran from 29 January to 20 February 2026.',
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The official lifecycle and key dates show that the consultation has closed and is under review; the prior proposed status was no longer current.',
      ),
      dates: [
        date('consultation_opened', '2026-01-29', 'day', source, true),
        date('consultation_closed', '2026-02-20', 'day', source),
      ],
      effectiveDate: '2026-01-29',
    });
  }

  {
    const policy = requirePolicy(
      policies,
      'asd-frontier-ai-models-cyber-security-2026',
    );
    const sourceUrl =
      'https://www.cyber.gov.au/about-us/view-all-content/news/frontier-models-and-their-impact-on-cyber-security';
    const source = evidence(sourceUrl, {
      title: 'Frontier models and their impact on cyber security',
      publisher: 'Australian Signals Directorate',
      publishedAt: '2026-04-09',
    });
    Object.assign(policy, {
      updatedAt: REVIEWED_AT,
      lastReviewedAt: REVIEWED_AT,
      verification: verified(
        source,
        'The official cyber.gov.au page confirms the title, publication date and the described offensive and defensive cyber implications.',
      ),
      dates: [date('published', '2026-04-09', 'day', source, true)],
      effectiveDate: '2026-04-09',
    });
  }

  await writeJsonFile(POLICIES_FILE, policies);
  console.log('Reconciled 8 register records against official sources.');
}

async function main() {
  await withDataMutationLock(reconcileRegisterEvidence);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
