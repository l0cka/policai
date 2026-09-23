/**
 * Freshness ratchet for the public register.
 *
 * A public record is overdue when its last editorial verification is older
 * than EDITORIAL_REVIEW_INTERVAL_DAYS. Overdue records stay published and are
 * labelled "Review due". This check fails only when the overdue count exceeds
 * `maxOverdueRecords` in data/freshness-budget.json.
 *
 * The budget is a ratchet: lower it whenever the backlog shrinks. Raising it
 * needs a reason in the pull request that changes the file; the check prints
 * the current count so the new value is not guessed.
 *
 * Usage:
 *   npm run check:freshness
 *   npm run check:freshness -- --now=2027-01-20   # rehearse a future date
 *   npm run check:freshness -- --json
 */

import path from 'path';
import { readJsonFile } from '../src/lib/file-store';
import { getPolicies } from '../src/lib/data-service';
import { buildRecordReviewSchedule } from '../src/lib/coverage-report';
import { EDITORIAL_REVIEW_INTERVAL_DAYS } from '../src/lib/verification';

interface FreshnessBudget {
  maxOverdueRecords: number;
  note?: string;
}

const BUDGET_FILE = path.join(process.cwd(), 'data', 'freshness-budget.json');
const UPCOMING_DAYS = 30;

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

  const budget = await readJsonFile<FreshnessBudget | null>(BUDGET_FILE, null);
  if (
    !budget ||
    !Number.isInteger(budget.maxOverdueRecords) ||
    budget.maxOverdueRecords < 0
  ) {
    console.error(
      `${BUDGET_FILE} must contain a non-negative integer "maxOverdueRecords".`,
    );
    process.exit(2);
  }

  const policies = await getPolicies(undefined, { now });
  const schedule = buildRecordReviewSchedule(policies, now);
  const overdue = schedule.filter((row) => row.overdue);
  const upcoming = schedule.filter(
    (row) => !row.overdue && row.daysLeft !== null && row.daysLeft <= UPCOMING_DAYS,
  );
  const passed = overdue.length <= budget.maxOverdueRecords;

  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          now: now.toISOString(),
          publicRecords: schedule.length,
          overdue: overdue.map(({ id, dueAt }) => ({ id, dueAt })),
          dueWithinDays: UPCOMING_DAYS,
          upcoming: upcoming.map(({ id, dueAt }) => ({ id, dueAt })),
          budget: budget.maxOverdueRecords,
          passed,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Record freshness at ${now.toISOString().slice(0, 10)}: ` +
        `${overdue.length} of ${schedule.length} public records overdue ` +
        `(budget ${budget.maxOverdueRecords}; review interval ` +
        `${EDITORIAL_REVIEW_INTERVAL_DAYS} days).`,
    );
    for (const row of overdue) {
      console.log(`  overdue  ${row.id} (due ${row.dueAt?.slice(0, 10) ?? 'never reviewed'})`);
    }
    for (const row of upcoming) {
      console.log(`  due soon ${row.id} (due ${row.dueAt?.slice(0, 10)}, ${row.daysLeft}d)`);
    }
    if (!passed) {
      console.error(
        `Freshness budget exceeded: re-verify records against their sources, ` +
          `or raise maxOverdueRecords with a stated reason.`,
      );
    } else if (overdue.length < budget.maxOverdueRecords) {
      console.log(
        `Backlog is below budget: lower maxOverdueRecords to ${overdue.length}.`,
      );
    }
  }
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
