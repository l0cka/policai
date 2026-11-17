import { parseArgs } from 'node:util';
import { withDataMutationLock } from '../src/lib/data-lock';
import {
  createBrowserFetch,
  type BrowserFetch,
} from '../src/lib/pipeline/browser-fetch';
import {
  getAutomaticSources,
  getSourceById,
} from '../src/lib/pipeline/sources';
import {
  CLEF_MODEL,
  clefUnavailableReason,
  createClefScorer,
  type RelevanceScorer,
} from '../src/lib/pipeline/clef-classify';
import { runCollection } from './collect-run';
import { FOLLOW_SOURCE_PREFIX } from '../src/lib/legislation/follow';

interface CliOptions {
  dryRun: boolean;
  sourceId?: string;
  maxItems?: number;
}

type CliCommand =
  | { kind: 'run'; options: CliOptions }
  | { kind: 'help' }
  | { kind: 'invalid'; message: string };

const USAGE = `Usage: npm run collect -- [--dry-run] [--source=<id>] [--max-items=<n>] [--help]

  --dry-run        preview the run and write nothing
  --source=<id>    collect one source, or one followed record with track:<policyId>
  --max-items=<n>  cap new items per source; a positive integer
  --help           print this text and exit`;

function parseCommand(argv: string[]): CliCommand {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        'dry-run': { type: 'boolean' },
        source: { type: 'string', multiple: true },
        'max-items': { type: 'string', multiple: true },
        help: { type: 'boolean' },
      },
    }));
  } catch (error) {
    return { kind: 'invalid', message: (error as Error).message };
  }
  if (values.help) return { kind: 'help' };

  const sources = values.source ?? [];
  if (sources.includes('')) {
    return { kind: 'invalid', message: '--source needs a source id' };
  }
  const caps = values['max-items'] ?? [];
  if (!caps.every((cap) => /^[1-9]\d*$/.test(cap))) {
    return { kind: 'invalid', message: '--max-items must be a positive integer' };
  }
  const cap = caps.at(-1);
  return {
    kind: 'run',
    options: {
      dryRun: values['dry-run'] ?? false,
      sourceId: sources.at(-1),
      maxItems: cap === undefined ? undefined : Number(cap),
    },
  };
}

async function createOptionalBrowserFetch(): Promise<BrowserFetch | null> {
  try {
    await import('playwright-core');
  } catch {
    console.warn(
      '[collect] playwright-core unavailable — browser retrieval disabled.',
    );
    return null;
  }
  return createBrowserFetch();
}

async function createOptionalClefScorer(): Promise<RelevanceScorer | undefined> {
  if (process.env.USE_CLEF_CLASSIFIER !== '1') {
    console.log('[collect] Analysis mode: keyword rules (detections require review)');
    return undefined;
  }
  const unavailable = await clefUnavailableReason();
  if (unavailable) {
    console.warn(`[collect] Analysis mode: keyword rules; Clef unavailable (${unavailable})`);
    return undefined;
  }
  console.log(`[collect] Analysis mode: local ${CLEF_MODEL} (detections require review)`);
  return createClefScorer({ log: (message) => console.warn(message) });
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  if (command.kind === 'help') {
    console.log(USAGE);
    return;
  }
  if (command.kind === 'invalid') {
    console.error(`[collect] ${command.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const { options } = command;

  const scoreRelevance = await createOptionalClefScorer();

  let sources = getAutomaticSources();
  if (options.sourceId?.startsWith(FOLLOW_SOURCE_PREFIX)) {
    sources = [];
    console.log(
      `[collect] Targeted follow watch ${options.sourceId}; catalogue sources are skipped.`,
    );
  } else if (options.sourceId) {
    const source = getSourceById(options.sourceId);
    if (!source) {
      console.error(`[collect] Unknown source id: ${options.sourceId}`);
      process.exitCode = 1;
      return;
    }
    sources = [source];
    console.log(
      `[collect] Targeted ${source.automation} source run; global collection health will not be overwritten.`,
    );
  }

  const browserFetch = await createOptionalBrowserFetch();

  const run = () =>
    runCollection({
      rootDir: process.cwd(),
      sources,
      dryRun: options.dryRun,
      sourceId: options.sourceId,
      maxItems: options.maxItems,
      browserFetchImpl: browserFetch?.fetchImpl,
      recycleBrowser: browserFetch?.close,
      scoreRelevance,
      stateDir: process.env.POLICAI_COLLECTOR_STATE || undefined,
    });

  try {
    if (options.dryRun) {
      await run();
    } else {
      await withDataMutationLock(run);
    }
  } finally {
    await browserFetch?.close();
  }
}

main().catch((error) => {
  console.error('[collect] Fatal:', error);
  process.exitCode = 1;
});
