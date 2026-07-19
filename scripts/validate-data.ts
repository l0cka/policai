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
  validateCollectionMeta,
  validateDevelopments,
  validatePolicies,
  validatePolicyFrameworkArtifact,
  validateSourceReviews,
  validateSourceMonitoring,
  validateTimeline,
  validateWatchSources,
  validateWatchState,
} from '../src/lib/validate-data';
import {
  emptyWatchState,
  type WatchState,
} from '../src/lib/pipeline/collect';
import { WATCH_SOURCES } from '../src/lib/pipeline/sources';
import type {
  Agency,
  CollectionMeta,
  Development,
  Policy,
  SourceReview,
  SourceMonitoringState,
  TimelineEvent,
} from '../src/types';

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const STATE_DIR = path.join(process.cwd(), 'data');

async function main() {
  const [
    policies,
    agencies,
    commonwealthAgencies,
    timeline,
    policyFramework,
    developments,
    meta,
    sourceReviews,
    sourceMonitoring,
    watchState,
  ] = await Promise.all([
      readJsonFile<Policy[]>(
        path.join(STATE_DIR, 'policies.json'),
        [],
      ),
      readJsonFile<Agency[]>(path.join(STATE_DIR, 'agencies.json'), []),
      readJsonFile<Agency[]>(
        path.join(STATE_DIR, 'commonwealth-agencies.json'),
        [],
      ),
      readJsonFile<TimelineEvent[]>(
        path.join(STATE_DIR, 'timeline.json'),
        [],
      ),
      readJsonFile<Record<string, unknown>>(
        path.join(STATE_DIR, 'dta-ai-policy-framework.json'),
        {},
      ),
      readJsonFile<Development[]>(
        path.join(STATE_DIR, 'developments.json'),
        [],
      ),
      readJsonFile<CollectionMeta>(
        path.join(PUBLIC_DATA_DIR, 'meta.json'),
        {
          lastCollectedAt: null,
          lastHealthyAt: null,
          lastReviewedAt: null,
          collector: {
            runCount: 0,
            lastRunSources: [],
            lastRunErrors: [],
            health: 'failed',
            dueSourceCount: 0,
            successfulSourceCount: 0,
            failedSourceCount: 0,
            skippedSourceCount: 0,
            successRate: 0,
            automaticSourceCount: 0,
            manualSourceCount: 0,
            sourceResults: [],
          },
        },
      ),
      readJsonFile<SourceReview[]>(
        path.join(STATE_DIR, 'source-reviews.json'),
        [],
      ),
      readJsonFile<SourceMonitoringState>(
        path.join(STATE_DIR, 'source-monitoring.json'),
        { manualReviews: [] },
      ),
      readJsonFile<WatchState>(
        path.join(STATE_DIR, 'watch-state.json'),
        emptyWatchState(),
      ),
    ]);

  if (policies.length === 0) {
    console.error('validate-data: policies.json is empty or unreadable');
    process.exitCode = 1;
    return;
  }

  const policyIds = new Set(policies.map((policy) => policy.id));
  const timelineEventIds = new Set(timeline.map((event) => event.id));
  const report = mergeReports(
    validatePolicies(policies),
    validateAgencies(agencies, 'agencies'),
    validateAgencies(commonwealthAgencies, 'commonwealth-agencies'),
    validateTimeline(timeline, policyIds),
    validatePolicyFrameworkArtifact(policyFramework, policies),
    validateDevelopments(developments, policyIds, timelineEventIds),
    validateCollectionMeta(meta),
    validateSourceReviews(sourceReviews, {
      policies,
      timelineEvents: timeline,
    }),
    validateSourceMonitoring(sourceMonitoring, WATCH_SOURCES),
    validateWatchState(watchState),
    validateWatchSources(WATCH_SOURCES),
  );

  for (const warning of report.warnings) {
    console.warn(`WARN  ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`ERROR ${error}`);
  }

  console.log(
    `validate-data: ${policies.length} policies, ${agencies.length}+${commonwealthAgencies.length} agencies, ` +
      `${timeline.length} timeline events, ${developments.length} developments, ` +
      `${sourceReviews.length} source reviews, ${sourceMonitoring.manualReviews.length} manual source checks, ` +
      `${WATCH_SOURCES.length} watch sources — ` +
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
