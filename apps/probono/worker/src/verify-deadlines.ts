import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool } from './lib/db.js';
import { buildVerifyPrompt, extractJson, type VerifyItem } from './lib/deadline-verify.js';
import { sydneyToday } from './lib/deadline-rules.js';
import { fetchPageText } from './lib/page-text.js';
import { openAiCompatibleTransport, VerifierAuthError, type VerifierTransport } from './lib/verifier-transport.js';
import { listDeadlinesToVerify } from './list-deadlines-to-verify.js';

/*
 * Verify one batch: fetch each source page, ask the model (no tools) for a
 * verdict on every stored date, and print one proposal per item as JSON.
 * This task only reads the database. ops/verify-deadlines.sh hands each
 * proposal to save-deadline-verification.ts, which re-validates it against the
 * item's current deadlines before anything is written.
 */

export type Proposal = {
  item_id: number;
  model: string;
  page_via: 'firecrawl' | 'direct';
  output: unknown;
};

export type ProposalFailure = { item_id: number; error: string };

export async function proposeVerifications(
  items: VerifyItem[],
  transport: VerifierTransport,
  {
    fetchPage = fetchPageText,
    today = sydneyToday(),
  }: { fetchPage?: typeof fetchPageText; today?: string } = {},
): Promise<{ proposals: Proposal[]; failures: ProposalFailure[] }> {
  const proposals: Proposal[] = [];
  const failures: ProposalFailure[] = [];
  for (const item of items) {
    const page = await fetchPage(item.url);
    if (!page) {
      // An unreadable page says nothing about the deadline; leave it alone
      // and let the next run try again.
      failures.push({ item_id: item.id, error: 'source page unreadable' });
      continue;
    }
    try {
      const reply = await transport.complete(buildVerifyPrompt(item, page.text, today));
      proposals.push({ item_id: item.id, model: transport.model, page_via: page.via, output: extractJson(reply) });
    } catch (err) {
      if (err instanceof VerifierAuthError) throw err;
      failures.push({ item_id: item.id, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
  }
  return { proposals, failures };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  (async () => {
    const limit = Math.min(50, Math.max(1, Number(process.env.VERIFY_BATCH ?? 25) || 25));
    const transport = openAiCompatibleTransport();
    const items = await listDeadlinesToVerify(limit);
    await closePool();
    const { proposals, failures } = await proposeVerifications(items, transport);
    for (const f of failures) console.error(`item ${f.item_id}: ${f.error}`);
    console.log(JSON.stringify(proposals));
  })().catch((err) => {
    // Never echo request headers or configuration; the message is enough.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(err instanceof VerifierAuthError ? 3 : 1);
  });
}
