import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool } from './lib/db.js';
import { CHECKER_MODEL, checkDeadlines } from './lib/deadline-check.js';
import type { Verdict, VerifyItem } from './lib/deadline-verify.js';
import { sydneyToday } from './lib/deadline-rules.js';
import { fetchPageText } from './lib/page-text.js';
import { listDeadlinesToVerify } from './list-deadlines-to-verify.js';

/*
 * Verify one batch: fetch each source page, check every stored date against
 * it, and print one proposal per item as JSON. This task only reads the
 * database. ops/verify-deadlines.sh hands each proposal to
 * save-deadline-verification.ts, which re-validates it against the item's
 * current deadlines before anything is written.
 */

export type Proposal = {
  item_id: number;
  model: string;
  page_via: 'firecrawl' | 'direct';
  output: { verdicts: Verdict[] };
};

export type ProposalNote = { item_id: number; note: string };

export async function proposeVerifications(
  items: VerifyItem[],
  {
    fetchPage = fetchPageText,
    today = sydneyToday(),
  }: { fetchPage?: typeof fetchPageText; today?: string } = {},
): Promise<{ proposals: Proposal[]; notes: ProposalNote[] }> {
  const proposals: Proposal[] = [];
  const notes: ProposalNote[] = [];
  for (const item of items) {
    const page = await fetchPage(item.url);
    if (!page) {
      // An unreadable page says nothing about the deadline; leave it alone
      // and let the next run try again.
      notes.push({ item_id: item.id, note: 'source page unreadable' });
      continue;
    }
    const checks = checkDeadlines(item, page.text, today);
    for (const c of checks) if (c.uncertain) notes.push({ item_id: item.id, note: c.uncertain });
    // A date left unchanged can be the item's main date, and saving its
    // siblings would move the headline or stamp the item checked. Propose the
    // item only when every date got a verdict; it stays queued otherwise.
    const verdicts = checks.flatMap((c) => (c.verdict ? [c.verdict] : []));
    if (verdicts.length < checks.length) continue;
    proposals.push({ item_id: item.id, model: CHECKER_MODEL, page_via: page.via, output: { verdicts } });
  }
  return { proposals, notes };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  (async () => {
    const limit = Math.min(50, Math.max(1, Number(process.env.VERIFY_BATCH ?? 25) || 25));
    const items = await listDeadlinesToVerify(limit);
    await closePool();
    const { proposals, notes } = await proposeVerifications(items);
    for (const n of notes) console.error(`item ${n.item_id}: ${n.note}`);
    console.log(JSON.stringify(proposals));
  })().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
