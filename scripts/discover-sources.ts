import { cliRun, parseCli } from '../src/lib/cli-args';
import { getBodies } from '../src/lib/data-service';
import { retrieveSource } from '../src/lib/pipeline/fetch';
import { createHostGate, robotsFetcher } from '../src/lib/pipeline/host-gate';
import { refusedHosts, WATCH_SOURCES } from '../src/lib/pipeline/sources';
import { discoverForBody } from '../src/lib/watch-coverage/discover';

const FLAGS = {
  body: { type: 'string', value: '<id>', required: true, help: 'a body id from data/bodies.json' },
  json: { type: 'boolean', help: 'print the proposals as JSON' },
} as const;

async function main() {
  const { values } = cliRun(parseCli('npm run discover:sources --', FLAGS, process.argv.slice(2)));
  const body = (await getBodies()).find((entry) => entry.id === values.body);
  if (!body) {
    console.error(`Unknown body id: ${values.body} (ids are in data/bodies.json)`);
    process.exit(2);
  }

  const gate = createHostGate({
    hosts: {},
    refused: refusedHosts(WATCH_SOURCES),
    fetchRobots: robotsFetcher(),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const discovery = await discoverForBody(body, {
    gate,
    fetchText: async (url) => (await retrieveSource(url, { gate, attempts: 1, timeoutMs: 60_000 })).body,
  });
  const watched = new Map(WATCH_SOURCES.map((source) => [source.url, source.id]));

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          body: body.id,
          proposals: discovery.proposals.map((p) => ({ ...p, watchedBy: watched.get(p.url) ?? null })),
          skipped: discovery.skipped,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Proposals for ${body.name} (${body.id}, tier ${body.tier}), hosts ${body.hosts.join(', ')}`);
  if (discovery.proposals.length === 0) console.log('  none');
  for (const proposal of discovery.proposals) {
    const already = watched.get(proposal.url);
    console.log(
      `  ${String(proposal.score).padStart(2)}  ${proposal.kind.padEnd(10)}  ${proposal.url}  (${proposal.evidence})` +
        (already ? `  already watched by ${already}` : ''),
    );
    for (const title of proposal.sampleTitles) console.log(`        ${title}`);
  }
  if (discovery.skipped.length > 0) {
    console.log('Skipped:');
    for (const { url, reason } of discovery.skipped) console.log(`  ${url}  ${reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
