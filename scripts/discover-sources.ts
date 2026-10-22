/**
 * Proposes watch sources for one publishing body in data/bodies.json, from
 * its robots.txt sitemaps, /sitemap.xml and the feeds its home page links.
 * Every request goes through the host gate under the declared identity and
 * the official-host allow-list. Writes nothing: admit a proposal through a
 * reviewed PR that adds it to src/lib/pipeline/sources.ts.
 *
 * Usage:
 *   npm run discover:sources -- --body=ato
 *   npm run discover:sources -- --body=ato --json
 */

import { getBodies } from '../src/lib/data-service';
import { retrieveSource } from '../src/lib/pipeline/fetch';
import { createHostGate, robotsFetcher } from '../src/lib/pipeline/host-gate';
import { refusedHosts, WATCH_SOURCES } from '../src/lib/pipeline/sources';
import { discoverForBody } from '../src/lib/watch-coverage/discover';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const bodyId = argument('body');
  const body = (await getBodies()).find((entry) => entry.id === bodyId);
  if (!body) {
    console.error(`Usage: npm run discover:sources -- --body=<id from data/bodies.json> (got ${bodyId ?? 'none'})`);
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
    fetchText: async (url) => (await retrieveSource(url, { gate, attempts: 1 })).body,
  });
  const watched = new Map(WATCH_SOURCES.map((source) => [source.url, source.id]));

  if (process.argv.includes('--json')) {
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
