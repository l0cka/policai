/**
 * Watch coverage: which publishing bodies in data/bodies.json the collector
 * watches, by jurisdiction and tier, with every gap and decided block.
 *
 * Usage:
 *   npm run report:watch-coverage
 *   npm run report:watch-coverage -- --json
 */

import {
  getBodies,
  getCollectionMeta,
  getSourceCheckTimes,
  getSourceHealth,
  getSourceMonitoring,
} from '../src/lib/data-service';
import { WATCH_SOURCES } from '../src/lib/pipeline/sources';
import { watchCoverage } from '../src/lib/watch-coverage/report';
import { getJurisdictionName } from '../src/types';

async function main() {
  const [bodies, sourceHealth, checkTimes, monitoring, meta] = await Promise.all([
    getBodies(),
    getSourceHealth(),
    getSourceCheckTimes(),
    getSourceMonitoring(),
    getCollectionMeta(),
  ]);
  const report = watchCoverage({
    bodies,
    sources: WATCH_SOURCES,
    sourceHealth,
    checkTimes,
    monitoring,
    sourceResults: meta.collector.sourceResults,
    now: new Date(),
  });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Watch coverage at ${report.asOf.slice(0, 10)} (automatic + manual of bodies)`);
  console.log('Jurisdiction                    Tier A   Tier B   Tier C');
  const jurisdictions = [...new Set(report.cells.map((cell) => cell.jurisdiction))];
  for (const jurisdiction of jurisdictions) {
    const columns = (['A', 'B', 'C'] as const).map((tier) => {
      const cell = report.cells.find((c) => c.jurisdiction === jurisdiction && c.tier === tier);
      return (cell ? `${cell.automatic + cell.manual}/${cell.bodies}` : '-').padEnd(9);
    });
    console.log(`${getJurisdictionName(jurisdiction).padEnd(32)}${columns.join('')}`);
  }
  if (report.unassessed > 0)
    console.log(`${report.unassessed} bodies have no scope decision yet and count as in scope.`);

  for (const tier of ['A', 'B', 'C'] as const) {
    const gaps = report.gaps.filter((gap) => gap.tier === tier);
    console.log(
      `\nGaps, tier ${tier}: ` +
        (gaps.length === 0
          ? 'none'
          : gaps.map((gap) => `${gap.bodyId} (${{ uncovered: 'no source', failing: 'failing', pending: 'not yet checked' }[gap.coverage]})`).join(', ')),
    );
  }

  console.log('\nBlocks (decided):' + (report.blocks.length === 0 ? ' none' : ''));
  for (const block of report.blocks) {
    const { because, decision, since, decidedBy } = block.automation;
    console.log(
      `  ${block.sourceId}  ${because}  ${decision}  since ${since}  ${decidedBy}  ` +
        `last reviewed ${block.lastReviewedAt?.slice(0, 10) ?? 'never'}${block.overdue ? '  REVIEW OVERDUE' : ''}`,
    );
  }

  console.log(
    '\nRefusals awaiting decision: ' +
      (report.undecidedRefusals.length === 0
        ? 'none'
        : report.undecidedRefusals
            .map((row) => `${row.sourceId} (${row.cls} since ${row.since.slice(0, 10)}, ${row.runs} runs)`)
            .join(', ')),
  );
  console.log(
    'Linked documents skipped: ' +
      (report.skippedLinked.length === 0
        ? 'none'
        : report.skippedLinked.map((row) => `${row.sourceId} -> ${row.url} (decided by ${row.decidedBy})`).join(', ')),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
