/**
 * Freshness ratchet for public records: register policies, timeline events
 * and developments.
 *
 * A public record is overdue when its last editorial verification is older
 * than EDITORIAL_REVIEW_INTERVAL_DAYS. Overdue records stay published and are
 * labelled "Review due". This check fails when the overdue count of any kind
 * exceeds that kind's budget in data/freshness-budget.json.
 *
 * Each budget is a ratchet: lower it whenever the backlog shrinks. Raising it
 * needs a reason in the pull request that changes the file; the check prints
 * the current counts so the new value is not guessed.
 *
 * Usage:
 *   npm run check:freshness
 *   npm run check:freshness -- --now=2027-01-20   # rehearse a future date
 *   npm run check:freshness -- --json
 */

import path from 'path';
import { readJsonFile } from '../src/lib/file-store';
import {
  getDevelopments,
  getPolicies,
  getTimelineEvents,
  TIMELINE_PROJECTION_SOURCE_ID,
} from '../src/lib/data-service';
import {
  buildRecordReviewSchedule,
  type ReviewableRecord,
} from '../src/lib/coverage-report';
import { EDITORIAL_REVIEW_INTERVAL_DAYS } from '../src/lib/verification';

const BUDGET_FILE = path.join(process.cwd(), 'data', 'freshness-budget.json');
const UPCOMING_DAYS = 30;

/** Each kind of public record that ages, with its budget key in the file. */
const KINDS = [
  {
    kind: 'policies',
    label: 'public records',
    budgetKey: 'maxOverdueRecords',
    load: (now: Date) => getPolicies(undefined, { now }),
  },
  {
    kind: 'timelineEvents',
    label: 'public timeline events',
    budgetKey: 'maxOverdueTimelineEvents',
    load: (now: Date) => getTimelineEvents(undefined, { includeGenerated: false, now }),
  },
  {
    kind: 'developments',
    label: 'editor-verified developments',
    budgetKey: 'maxOverdueDevelopments',
    // Unverified detections show "Needs review", not "Review due", and the
    // feed's timeline projections age with their timeline event.
    load: async (now: Date) =>
      (await getDevelopments(undefined, { now })).filter(
        (development) =>
          development.verification.method === 'manual' &&
          development.sourceId !== TIMELINE_PROJECTION_SOURCE_ID,
      ),
  },
] as const satisfies readonly {
  kind: string;
  label: string;
  budgetKey: string;
  load: (now: Date) => Promise<ReviewableRecord[]>;
}[];

type BudgetKey = (typeof KINDS)[number]['budgetKey'];
type FreshnessBudget = Record<BudgetKey, number> & { note?: string };

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const nowArg = argument('now');
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`Invalid --now value: ${nowArg}`);
    process.exit(2);
  }

  const budget = await readJsonFile<Partial<FreshnessBudget> | null>(BUDGET_FILE, null);
  const invalid = KINDS.filter(({ budgetKey }) => {
    const value = budget?.[budgetKey];
    return !Number.isInteger(value) || value! < 0;
  });
  if (!budget || invalid.length > 0) {
    console.error(
      `${BUDGET_FILE} must contain non-negative integers ` +
        KINDS.map(({ budgetKey }) => `"${budgetKey}"`).join(', ') +
        '.',
    );
    process.exit(2);
  }

  const reports = await Promise.all(
    KINDS.map(async ({ kind, label, budgetKey, load }) => {
      const schedule = buildRecordReviewSchedule(await load(now), now);
      const overdue = schedule.filter((row) => row.overdue);
      const upcoming = schedule.filter(
        (row) => !row.overdue && row.daysLeft !== null && row.daysLeft <= UPCOMING_DAYS,
      );
      const limit = budget[budgetKey]!;
      return { kind, label, budgetKey, total: schedule.length, overdue, upcoming, limit, passed: overdue.length <= limit };
    }),
  );
  const passed = reports.every((report) => report.passed);

  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          now: now.toISOString(),
          dueWithinDays: UPCOMING_DAYS,
          ...Object.fromEntries(
            reports.map((report) => [
              report.kind,
              {
                total: report.total,
                overdue: report.overdue.map(({ id, dueAt }) => ({ id, dueAt })),
                upcoming: report.upcoming.map(({ id, dueAt }) => ({ id, dueAt })),
                budget: report.limit,
                passed: report.passed,
              },
            ]),
          ),
          passed,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Record freshness at ${now.toISOString().slice(0, 10)} ` +
        `(review interval ${EDITORIAL_REVIEW_INTERVAL_DAYS} days):`,
    );
    for (const report of reports) {
      console.log(
        `\n${report.overdue.length} of ${report.total} ${report.label} overdue ` +
          `(budget ${report.limit}, ${report.budgetKey}).`,
      );
      for (const row of report.overdue) {
        console.log(`  overdue  ${row.id} (due ${row.dueAt?.slice(0, 10) ?? 'never reviewed'})`);
      }
      for (const row of report.upcoming) {
        console.log(`  due soon ${row.id} (due ${row.dueAt?.slice(0, 10)}, ${row.daysLeft}d)`);
      }
      if (!report.passed) {
        console.error(
          `Freshness budget exceeded for ${report.label}: re-verify them against their sources ` +
            `(npm run reconfirm:register), or raise ${report.budgetKey} with a stated reason.`,
        );
      } else if (report.overdue.length < report.limit) {
        console.log(`Backlog is below budget: lower ${report.budgetKey} to ${report.overdue.length}.`);
      }
    }
  }
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
