/**
 * Scores every development in data/developments.json with the local Clef
 * classifier and prints how its verdicts line up with what editors decided
 * (promoted or dismissed). Read-only; run it on Argus, where clef-flash lives.
 *
 * Usage:
 *   npx tsx scripts/compare-classifier.ts [--file=data/developments.json]
 */

import { readFileSync } from 'node:fs';
import {
  clefUnavailableReason,
  createClefScorer,
} from '../src/lib/pipeline/clef-classify';
import type { Development } from '../src/types';

const cell = (value: string) => value.replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 90);

async function main() {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
  const file = fileArg?.slice('--file='.length) ?? 'data/developments.json';
  const developments = (
    JSON.parse(readFileSync(file, 'utf8')) as Development[]
  ).filter((development) => development.status !== 'detected');

  const unavailable = await clefUnavailableReason();
  if (unavailable) {
    console.error(`Clef unavailable: ${unavailable}`);
    process.exitCode = 1;
    return;
  }

  const scores = await createClefScorer({ log: console.warn })(
    developments.map((development) => ({
      id: development.id,
      title: development.title,
      text: development.summary ?? '',
      sourceName: development.sourceName,
    })),
  );

  let agree = 0;
  let scored = 0;
  console.log('| Editor | Keyword | Clef | Agrees | Title | Dismissal reason |');
  console.log('|---|---|---|---|---|---|');
  for (const development of developments) {
    const score = scores.get(development.id);
    const kept = development.status === 'promoted';
    const agrees = score === undefined ? 'n/a' : (score >= 0.5) === kept ? 'yes' : 'no';
    if (score !== undefined) {
      scored += 1;
      if (agrees === 'yes') agree += 1;
    }
    console.log(
      `| ${development.status} | ${development.classification === 'curated' ? '-' : development.relevanceScore} | ` +
        `${score === undefined ? 'n/a' : score.toFixed(2)} | ${agrees} | ${cell(development.title)} | ` +
        `${cell(development.dismissalReason ?? '')} |`,
    );
  }
  console.log(`\nClef agrees with editors on ${agree} of ${scored} scored items.`);
  if (scored === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
