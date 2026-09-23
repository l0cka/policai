import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyStatusName,
  getPolicyTypeName,
  type Policy,
} from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';

const SITE_URL = 'https://policai.org';

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

/**
 * A self-contained Markdown copy of a public register record, suitable for
 * pasting into another document or a model's context window. Provenance
 * travels inside the artifact, and an absent editorial review is stated
 * rather than omitted.
 */
export function buildPolicyMarkdown(policy: Policy): string {
  const verification = policy.verification;
  const checkedAt = formatTimestamp(verification.checkedAt);
  const verificationLine = [
    `${verification.status}${verification.method ? ` (${verification.method})` : ''}`,
    checkedAt ? `checked ${checkedAt}` : 'check date not recorded',
  ].join(', ');
  const lastReview =
    formatTimestamp(policy.lastReviewedAt) ??
    'never re-verified since publication';

  const lines = [
    `# ${policy.title}`,
    '',
    `- Jurisdiction: ${getJurisdictionName(policy.jurisdiction)}`,
    `- Type: ${getPolicyTypeName(policy.type)}`,
    `- Status: ${getPolicyStatusName(policy.status)}`,
    ...policy.dates.map(
      (date) => `- ${getPolicyDateTypeName(date.type)}: ${formatPolicyDate(date)}`,
    ),
    ...(policy.supersededBy
      ? [`- Superseded by: ${SITE_URL}/policies/${policy.supersededBy}`]
      : []),
    ...(policy.agencies.length > 0
      ? [`- Agencies: ${policy.agencies.join('; ')}`]
      : []),
    `- Official source: ${policy.sourceUrl}`,
    `- Verification: ${verificationLine}`,
    `- Last editorial review: ${lastReview}`,
    `- Policai record: ${SITE_URL}/policies/${policy.id}`,
    '',
    '## Summary',
    '',
    policy.aiSummary || policy.description,
    '',
    '## Content',
    '',
    policy.content,
    '',
    '---',
    '',
    'Policai is an unofficial register. Verify against the official source before relying on this record.',
    '',
  ];
  return lines.join('\n');
}
