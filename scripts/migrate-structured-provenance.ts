/**
 * One-off, idempotent migration from ambiguous legacy dates and unlabelled
 * public datasets to the structured provenance model introduced in July 2026.
 *
 * Keep this script as an auditable record of how legacy fields were mapped.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type {
  Agency,
  Development,
  Policy,
  PolicyDate,
  PolicyDateType,
  TimelineEvent,
} from '../src/types';

const EDITORIAL_DATA_DIR = path.join(process.cwd(), 'data');
const REVIEWED_AT = '2026-07-16T00:00:00.000Z';

const dateTypes: Record<string, PolicyDateType> = {
  'policy-responsible-use-ai-government-v2': 'effective',
  'implementation-plan-policy-responsible-use-ai-government-2025': 'amended',
  'safe-and-responsible-ai-australia-proposals-paper': 'consultation_opened',
  'automated-decision-making-ai-regulation-issues-paper':
    'consultation_opened',
  'queensland-ai-governance-policy': 'effective',
  'queensland-use-of-generative-ai-in-government': 'effective',
  'queensland-foundational-ai-risk-assessment-guideline': 'effective',
  'sa-artificial-intelligence-ethics-policy': 'approved',
  'sa-guideline-use-of-generative-ai-and-llm-tools': 'approved',
  'nt-artificial-intelligence-assurance-framework': 'effective',
  'federal-court-gpn-ai': 'issued',
  'nsw-supreme-court-sc-gen-23': 'issued',
  'vic-supreme-court-ai-guidelines': 'issued',
  'family-court-ai-practice-direction': 'issued',
  'qld-supreme-court-ai-practice-direction': 'issued',
  'apra-ai-industry-letter-2026': 'issued',
  'esafety-genai-industry-codes': 'commenced',
  'act-ai-policy': 'effective',
  'vic-supreme-court-sc-gen-25': 'issued',
  'sa-courts-genai-guidelines': 'effective',
};

function legacyDates(policy: Policy): PolicyDate[] {
  if (policy.dates?.length) return policy.dates;
  const primary: PolicyDate = {
    type: dateTypes[policy.id] ?? 'published',
    date: policy.effectiveDate,
    precision:
      policy.id === 'sa-ai-for-better-government-discussion-paper'
        ? 'month'
        : 'day',
    primary: true,
    source: policy.verification.source,
  };

  if (policy.id === 'asd-blueprint-secure-cloud-ai-usage-policy') {
    return [
      primary,
      {
        type: 'amended',
        date: '2026-04-20',
        precision: 'day',
        source: policy.verification.source,
      },
    ];
  }
  return [primary];
}

async function runMigration() {
  const [
    policies,
    developments,
    agencies,
    commonwealthAgencies,
    timeline,
    framework,
  ] =
    await Promise.all([
      readJsonFile<Policy[]>(
        path.join(EDITORIAL_DATA_DIR, 'policies.json'),
        [],
      ),
      readJsonFile<Development[]>(
        path.join(EDITORIAL_DATA_DIR, 'developments.json'),
        [],
      ),
      readJsonFile<Agency[]>(
        path.join(EDITORIAL_DATA_DIR, 'agencies.json'),
        [],
      ),
      readJsonFile<Agency[]>(
        path.join(EDITORIAL_DATA_DIR, 'commonwealth-agencies.json'),
        [],
      ),
      readJsonFile<TimelineEvent[]>(
        path.join(EDITORIAL_DATA_DIR, 'timeline.json'),
        [],
      ),
      readJsonFile<Record<string, unknown>>(
        path.join(EDITORIAL_DATA_DIR, 'dta-ai-policy-framework.json'),
        {},
      ),
    ]);

  const migratedPolicies = policies.map((policy) => ({
    ...policy,
    dates: legacyDates(policy),
  }));
  const policyById = new Map(
    migratedPolicies.map((policy) => [policy.id, policy]),
  );
  const developmentByUrl = new Map(
    developments.map((development) => [development.url, development]),
  );

  function migrateAgency(agency: Agency): Agency {
    const sourceUrl = agency.transparencyStatementUrl || agency.website;
    return {
      ...agency,
      verification: agency.verification ?? {
        status: 'needs_review',
        source: { url: sourceUrl },
        notes:
          'Legacy directory record; the agency statement and absence/presence claim require editorial re-checking.',
      },
    };
  }

  const migratedTimeline = timeline
    .filter(
      (event) =>
        event.id !==
        'tl-2020-06-01-csiro-ai-ethics-principles-adopted',
    )
    .map((event): TimelineEvent => {
      if (
        event.id ===
        'tl-2023-01-01-dta-responsible-ai-network-established'
      ) {
        const sourceUrl =
          'https://www.csiro.au/en/news/All/News/2023/June/New-report-to-help-business-implement-responsible-AI';
        return {
          ...event,
          id: 'tl-2023-06-22-responsible-ai-network-first-report',
          date: '2023-06-22',
          title: 'Responsible AI Network publishes its first major report',
          description:
            "Australia's National AI Centre, coordinated by CSIRO, publishes the Responsible AI Network's first major report on implementing Australia's AI Ethics Principles.",
          sourceUrl,
          verification: {
            status: 'verified',
            source: {
              url: sourceUrl,
              title: 'New report to help businesses implement responsible AI',
              publisher: 'CSIRO',
              publishedAt: '2023-06-22',
              retrievedAt: REVIEWED_AT,
            },
            checkedAt: REVIEWED_AT,
            checkedBy: 'Codex source review',
            method: 'manual',
          },
        };
      }

      const relatedPolicy = event.relatedPolicyId
        ? policyById.get(event.relatedPolicyId)
        : undefined;
      const sourceUrl =
        event.sourceUrl || relatedPolicy?.sourceUrl || '';
      const relatedDevelopment = developmentByUrl.get(sourceUrl);
      const policyDateMatches =
        relatedPolicy?.dates.some(
          (date) => String(date.date).slice(0, 10) === String(event.date).slice(0, 10),
        ) ?? false;
      const developmentDateMatches =
        relatedDevelopment?.publishedAt === String(event.date).slice(0, 10);
      const inheritedVerification =
        relatedPolicy?.sourceUrl === sourceUrl &&
        relatedPolicy.verification.status === 'verified' &&
        policyDateMatches
          ? relatedPolicy.verification
          : relatedDevelopment?.verification.status === 'verified' &&
              developmentDateMatches
            ? relatedDevelopment.verification
            : undefined;

      return {
        ...event,
        sourceUrl,
        verification: event.verification ?? inheritedVerification ?? {
          status: 'needs_review',
          source: { url: sourceUrl },
          notes:
            'Legacy timeline entry; its date and description require editorial re-checking against the source.',
        },
      };
    });
  const frameworkPolicy = policyById.get(
    'policy-responsible-use-ai-government-v2',
  );
  if (!frameworkPolicy) {
    throw new Error('Framework policy record is missing');
  }
  const migratedFramework = {
    ...framework,
    relatedPolicyId: frameworkPolicy.id,
    verification: frameworkPolicy.verification,
  };

  await Promise.all([
    writeJsonFile(
      path.join(EDITORIAL_DATA_DIR, 'policies.json'),
      migratedPolicies,
    ),
    writeJsonFile(
      path.join(EDITORIAL_DATA_DIR, 'agencies.json'),
      agencies.map(migrateAgency),
    ),
    writeJsonFile(
      path.join(EDITORIAL_DATA_DIR, 'commonwealth-agencies.json'),
      commonwealthAgencies.map(migrateAgency),
    ),
    writeJsonFile(
      path.join(EDITORIAL_DATA_DIR, 'timeline.json'),
      migratedTimeline,
    ),
    writeJsonFile(
      path.join(EDITORIAL_DATA_DIR, 'dta-ai-policy-framework.json'),
      migratedFramework,
    ),
  ]);
}

async function main() {
  await withDataMutationLock(runMigration);
}

main().catch((error) => {
  console.error('migrate-structured-provenance: fatal', error);
  process.exitCode = 1;
});
