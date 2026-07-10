/**
 * Validate the repo's canonical data files. Fails (exit 1) on structural
 * errors; prints warnings without failing. Runs in CI and after every
 * collector pass.
 *
 * Usage: npx tsx scripts/validate-data.ts
 */

import path from 'path';
import { readJsonFile } from '../src/lib/file-store';
import {
  mergeReports,
  validateAgencies,
  validateDevelopments,
  validatePolicies,
  validateTimeline,
} from '../src/lib/validate-data';
import type {
  Agency,
  Development,
  Policy,
  TimelineEvent,
} from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

async function main() {
  const [policies, agencies, commonwealthAgencies, timeline, developments] =
    await Promise.all([
      readJsonFile<Policy[]>(path.join(DATA_DIR, 'policies.json'), []),
      readJsonFile<Agency[]>(path.join(DATA_DIR, 'agencies.json'), []),
      readJsonFile<Agency[]>(
        path.join(DATA_DIR, 'commonwealth-agencies.json'),
        [],
      ),
      readJsonFile<TimelineEvent[]>(path.join(DATA_DIR, 'timeline.json'), []),
      readJsonFile<Development[]>(
        path.join(DATA_DIR, 'developments.json'),
        [],
      ),
    ]);

  if (policies.length === 0) {
    console.error('validate-data: policies.json is empty or unreadable');
    process.exitCode = 1;
    return;
  }

  const policyIds = new Set(policies.map((policy) => policy.id));
  const report = mergeReports(
    validatePolicies(policies),
    validateAgencies(agencies, 'agencies'),
    validateAgencies(commonwealthAgencies, 'commonwealth-agencies'),
    validateTimeline(timeline, policyIds),
    validateDevelopments(developments),
  );

  for (const warning of report.warnings) {
    console.warn(`WARN  ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`ERROR ${error}`);
  }

  console.log(
    `validate-data: ${policies.length} policies, ${agencies.length}+${commonwealthAgencies.length} agencies, ` +
      `${timeline.length} timeline events, ${developments.length} developments — ` +
      `${report.errors.length} errors, ${report.warnings.length} warnings`,
  );

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('validate-data: fatal', error);
  process.exitCode = 1;
});
