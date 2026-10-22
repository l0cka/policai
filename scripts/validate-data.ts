/**
 * Validate the repo's canonical data files. Fails (exit 1) on structural
 * errors; prints warnings without failing. Runs in CI and after every
 * collector pass.
 *
 * Secondary (non-primary) structured dates on verified records are gated as a
 * lower-only budget ratchet instead of hard errors, so historical records stay
 * valid while any growth in unevidenced dates fails validation. The count of
 * secondary dates without matching source evidence must not exceed
 * `maxUnevidencedSecondaryDates` in data/record-evidence-budget.json.
 *
 * Usage: npx tsx scripts/validate-data.ts
 */

import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readJsonFile } from '../src/lib/file-store';
import { countUnsubstantiatedSecondaryDates } from '../src/lib/validate-data';
import { readArticleImageFiles } from '../src/lib/article-image-files';
import { readArticleSources } from '../src/lib/articles';
import { readArticleBaseline } from '../src/lib/article-baseline';
import { getPolicies } from '../src/lib/data-service';
import {
  mergeReports,
  validateAgencies,
  validateArticles,
  validateCollectionMeta,
  validateCourtRequirements,
  validateDevelopments,
  validatePolicies,
  validatePolicyThemes,
  validatePolicyFrameworkArtifact,
  validateSourceReviews,
  validateSourceMonitoring,
  validateThemeCoverage,
  validateLegislativeTimelineOverlap,
  validateTimeline,
  validateBodies,
  validateSiteReuse,
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
  CourtRequirement,
  Development,
  Policy,
  SourceReview,
  SourceMonitoringState,
  TimelineEvent,
} from '../src/types';

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const STATE_DIR = path.join(process.cwd(), 'data');

const execFileAsync = promisify(execFile);

/**
 * Ratchet guard: on a pull request that touches the budget file, its
 * `maxUnevidencedSecondaryDates` may only decrease relative to the merge base.
 * Raising it needs a stated reason in the pull request, so this guard fails
 * validation when an increase is detected. Outside a pull request (local
 * runs, scheduled collector runs) the base value is unknown and the guard is
 * skipped — the growth gate in main() still applies.
 */
async function budgetIncreaseCommittedOnBranch(): Promise<number | undefined> {
  if (process.env.GITHUB_BASE_SHA === undefined) {
    return undefined;
  }
  try {
    const { stdout } = await execFileAsync('git', [
      'show',
      `${process.env.GITHUB_BASE_SHA}:data/record-evidence-budget.json`,
    ]);
    const base = JSON.parse(stdout) as {
      maxUnevidencedSecondaryDates?: unknown;
    };
    return Number.isInteger(base.maxUnevidencedSecondaryDates)
      ? (base.maxUnevidencedSecondaryDates as number)
      : undefined;
  } catch {
    // The file is new on this branch or the base SHA is unavailable: the
    // guard has no baseline to compare against.
    return undefined;
  }
}

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
    courtRequirements,
    bodies,
    siteReuse,
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
          lastUsableAt: null,
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
      readJsonFile<CourtRequirement[]>(
        path.join(STATE_DIR, 'court-requirements.json'),
        [],
      ),
      readJsonFile<unknown>(path.join(STATE_DIR, 'bodies.json'), null),
      readJsonFile<unknown>(path.join(STATE_DIR, 'site-reuse.json'), null),
    ]);

  if (policies.length === 0) {
    console.error('validate-data: policies.json is empty or unreadable');
    process.exitCode = 1;
    return;
  }

  const [articles, articleBaseline, publicPolicies, articleImages] = await Promise.all([
    readArticleSources(path.join(STATE_DIR, 'articles')),
    readArticleBaseline({
      cwd: process.cwd(),
      baseSha: process.env.GITHUB_BASE_SHA,
    }),
    getPolicies(),
    readArticleImageFiles(path.join(process.cwd(), 'public')),
  ]);

  const policyIds = new Set(policies.map((policy) => policy.id));
  const timelineEventIds = new Set(timeline.map((event) => event.id));
  const report = mergeReports(
    validatePolicies(policies),
    validatePolicyThemes(policies),
    validateThemeCoverage(policies, publicPolicies),
    validateCourtRequirements(courtRequirements, policies),
    validateAgencies(agencies, 'agencies'),
    validateAgencies(commonwealthAgencies, 'commonwealth-agencies'),
    validateTimeline(timeline, policyIds),
    validateLegislativeTimelineOverlap(policies, timeline),
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
    validateBodies(bodies, WATCH_SOURCES, {
      agencies,
      'commonwealth-agencies': commonwealthAgencies,
    }),
    validateSiteReuse(siteReuse, bodies),
    validateArticles(articles, articleBaseline, {
      policies,
      publicPolicies,
      images: articleImages,
    }),
  );

  for (const warning of report.warnings) {
    console.warn(`WARN  ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`ERROR ${error}`);
  }

  // Secondary-date evidence gate: a lower-only budget ratchet mirroring
  // scripts/check-freshness.ts. The budget file is seeded from the current
  // measured state; the check passes at or below budget and fails when the
  // count grows.
  const unevidencedSecondaryDates =
    countUnsubstantiatedSecondaryDates(policies);
  const evidenceBudget = await readJsonFile<{
    maxUnevidencedSecondaryDates?: unknown;
    note?: string;
  }>(path.join(STATE_DIR, 'record-evidence-budget.json'), {});
  if (
    !Number.isInteger(evidenceBudget.maxUnevidencedSecondaryDates) ||
    (evidenceBudget.maxUnevidencedSecondaryDates as number) < 0
  ) {
    console.error(
      'ERROR data/record-evidence-budget.json must contain a non-negative integer "maxUnevidencedSecondaryDates".',
    );
    process.exitCode = 1;
  } else {
    const budget = evidenceBudget.maxUnevidencedSecondaryDates as number;
    for (const entry of unevidencedSecondaryDates) {
      console.error(
        `UNEVIDENCED-SECONDARY-DATE ${entry.policyId}:dates[${entry.dateIndex}] — secondary date has no matching source publication metadata or reviewedDate evidence`,
      );
    }
    const passed = unevidencedSecondaryDates.length <= budget;
    console.log(
      `validate-data: ${unevidencedSecondaryDates.length} secondary dates without per-entry source evidence (budget ${budget}, lower-only ratchet — see data/record-evidence-budget.json).`,
    );
    if (!passed) {
      console.error(
        `ERROR Record evidence budget exceeded: add reviewedDate or publication-metadata evidence for the listed dates, ` +
          `or raise maxUnevidencedSecondaryDates with a stated reason.`,
      );
      process.exitCode = 1;
    } else if (unevidencedSecondaryDates.length < budget) {
      console.log(
        `Secondary-date evidence backlog is below budget: lower maxUnevidencedSecondaryDates to ${unevidencedSecondaryDates.length}.`,
      );
    }
    const baseBudget = await budgetIncreaseCommittedOnBranch();
    if (baseBudget !== undefined && budget > baseBudget) {
      console.error(
        `ERROR record-evidence-budget ratchet: maxUnevidencedSecondaryDates rose from ${baseBudget} to ${budget} without a stated reason. Lower it back, or argue the increase in the pull request.`,
      );
      process.exitCode = 1;
    }
  }

  console.log(
    `validate-data: ${policies.length} policies, ${agencies.length}+${commonwealthAgencies.length} agencies, ` +
      `${timeline.length} timeline events, ${developments.length} developments, ` +
      `${courtRequirements.length} court requirements, ` +
      `${sourceReviews.length} source reviews, ${sourceMonitoring.manualReviews.length} manual source checks, ` +
      `${articles.length} articles (${articleBaseline ? 'compared with the base' : 'no base; all treated as new'}), ` +
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
