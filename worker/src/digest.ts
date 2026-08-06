import nodemailer from 'nodemailer';
import { closePool, getPool } from './lib/db.js';
import { renderDigest, type DigestItem } from './lib/render-digest.js';
import { STREAMS } from './lib/types.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = getPool();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 3600 * 1000);

  const { rows: items } = await pool.query(
    `SELECT i.id, i.title, i.url, i.blurb, i.stream, i.opportunity, i.entities, s.name AS source_name
     FROM items i JOIN sources s ON s.id = i.source_id
     WHERE i.created_at >= $1 ORDER BY i.opportunity DESC, i.created_at DESC`,
    [periodStart.toISOString()],
  );
  const { rows: failures } = await pool.query(
    `SELECT DISTINCT s.name FROM ingest_runs r JOIN sources s ON s.id = r.source_id
     WHERE r.status = 'failed' AND r.created_at >= $1`,
    [periodStart.toISOString()],
  );

  const opportunities = items.filter((i) => i.opportunity) as DigestItem[];
  const byStream: Record<string, DigestItem[]> = {};
  for (const s of STREAMS) byStream[s] = items.filter((i) => !i.opportunity && i.stream === s);
  const unclassified = items.filter((i) => !i.opportunity && !i.stream);
  if (unclassified.length) byStream['news'] = [...(byStream['news'] ?? []), ...unclassified];

  const deadlines = items
    .flatMap((i) => ((i.entities?.deadlines ?? []) as { date: string; label: string }[])
      .map((d) => ({ ...d, itemTitle: i.title as string })))
    .filter((d) => d.date >= periodEnd.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));

  const html = renderDigest({
    periodStart, periodEnd,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:8850',
    opportunities, byStream, deadlines,
    failedSources: failures.map((f) => f.name),
  });

  if (dryRun) {
    console.log(html);
    await closePool();
    return;
  }

  const { SMTP_USER, SMTP_PASS, DIGEST_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !DIGEST_TO) throw new Error('SMTP_USER, SMTP_PASS, DIGEST_TO must be set');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: `Pro Bono Radar <${SMTP_USER}>`,
    to: DIGEST_TO,
    subject: `Pro Bono Radar — ${items.length} developments this week`,
    html,
  });
  await pool.query(
    `INSERT INTO digests (period_start, period_end, item_ids) VALUES ($1, $2, $3)`,
    [periodStart.toISOString(), periodEnd.toISOString(), items.map((i) => i.id)],
  );
  console.log(`digest sent: ${items.length} items to ${DIGEST_TO}`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1); // loud failure -> journald via systemd
});
