import type { Policy } from '@/types';

function normaliseSummaryText(text: unknown): string {
  return typeof text === 'string'
    ? text.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

export function summaryRepeatsDescription(
  policy: Pick<Policy, 'aiSummary' | 'description'>,
): boolean {
  const summary = normaliseSummaryText(policy.aiSummary);
  return summary !== '' && summary === normaliseSummaryText(policy.description);
}
