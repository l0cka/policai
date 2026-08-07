import Link from 'next/link';
import { getPool } from '../../lib/db';
import SectorDiagram from '../sector-diagram';
import SectorDirectory from '../sector-directory';
import {
  COMPILED,
  ORGANISATIONS,
  RESEARCH_NOTES,
  TIERS,
  markMonitored,
  type TierKey,
} from '../../lib/sector-data';

export const dynamic = 'force-dynamic';

const TIER_LABEL = Object.fromEntries(TIERS.map((t) => [t.key, t.label])) as Record<
  TierKey,
  string
>;

export const metadata = {
  title: 'The sector — Pro Bono Radar',
  description:
    'Every organisation that funds, coordinates, delivers or studies legal assistance in Australia, and how money and pro bono capacity actually reach a person with a legal problem.',
};

// The gaps worth naming on the page, rather than leaving a reader to count.
const GAP_TIERS: TierKey[] = ['fvpls', 'atsils', 'clc'];

export default async function SectorPage() {
  const { rows } = await getPool().query(`SELECT name FROM sources WHERE active`);
  const orgs = markMonitored(
    ORGANISATIONS,
    rows.map((r) => r.name as string),
  );

  const monitored = orgs.filter((o) => o.monitored).length;
  const gaps = GAP_TIERS.map((tier) => {
    const inTier = orgs.filter((o) => o.tier === tier);
    return { tier, total: inTier.length, monitored: inTier.filter((o) => o.monitored).length };
  });

  return (
    <div className="container page">
      <header className="page-head reveal">
        <p className="page-eyebrow">Sector reference · compiled {COMPILED}</p>
        <h1 className="page-title">Who actually does access to justice</h1>
        <p className="page-intro">
          Every organisation that funds, coordinates, delivers or studies legal assistance in
          Australia — {orgs.length} of them, across eleven kinds of body and nine jurisdictions.
          The diagram shows how money and unpaid capacity reach a person with a legal problem.
          The directory lists the whole sector, marking which parts this radar already collects
          from.
        </p>
      </header>

      <div className="stat-strip reveal reveal-1">
        <span className="stat">
          <b>{orgs.length}</b>
          <span>organisations</span>
        </span>
        <span className="stat">
          <b>11</b>
          <span>kinds of body</span>
        </span>
        <span className="stat">
          <b>9</b>
          <span>jurisdictions</span>
        </span>
        <span className="stat">
          <b>{monitored}</b>
          <span>already on the radar</span>
        </span>
        <span className="stat">
          <b>$3.9b</b>
          <span>NAJP 2025–30</span>
        </span>
      </div>

      <section aria-label="How help reaches someone">
        <h2 className="section-heading">How help actually reaches someone</h2>
        <p className="section-intro">
          Two channels, and they do not meet until the very end. Public money flows through a
          single five-year agreement to four delivery arms. Pro bono is not in that agreement at
          all: it is unpaid capacity from the profession, and it reaches people through clearing
          houses and court referral schemes rather than directly. The peaks coordinate; they do
          not deliver.
        </p>
        <SectorDiagram />
      </section>

      <aside className="sector-callout">
        <h2>The name everyone still uses is wrong</h2>
        <p>
          <strong>NLAP is over.</strong> The National Legal Assistance Partnership 2020–25 expired
          on 30 June 2025 and was replaced by the{' '}
          <strong>National Access to Justice Partnership (NAJP) 2025–30</strong> — $3.9 billion
          over five years, with $833 million for community legal centres and women&rsquo;s legal
          services, a 74% increase. Sector material still saying &ldquo;NLAP&rdquo; is using
          historical language. Two renames worth knowing alongside it: the National Association of
          Community Legal Centres became <strong>Community Legal Centres Australia</strong> in
          2020, and the National FVPLS Forum is now{' '}
          <strong>First Nations Advocates Against Family Violence</strong>. Counting either under
          both names double-counts the sector.
        </p>
      </aside>

      <section aria-label="Where the radar is thin">
        <h2 className="section-heading">Where this radar is thin</h2>
        <p className="section-intro">
          Coverage is strong at the top of the sector and thin at the delivery edge — the
          organisations closest to unmet need, and the ones whose closures and funding shortfalls
          surface first. Use the <em>On the radar</em> filter below to see the difference, then
          check <Link href="/health">source health</Link> for what is already running.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>On the radar</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.tier}>
                  <td>{TIER_LABEL[g.tier]}</td>
                  <td>
                    <span className={g.monitored === 0 ? 'status status-failed' : 'status status-ok'}>
                      {g.monitored}
                    </span>
                  </td>
                  <td className="cell-mono">{g.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="The directory">
        <h2 className="section-heading">The directory</h2>
        <p className="section-intro">
          All {orgs.length} organisations, grouped by what they do. A green dot marks one this
          radar already collects from.
        </p>
        <SectorDirectory orgs={orgs} />
      </section>

      <section aria-label="Method" className="sector-method">
        <h2 className="section-heading">Method, and what this does not claim</h2>
        <p className="section-intro">
          Five researchers worked the sector in parallel, each from real member directories rather
          than recall — the NATSILS member panel, the FNAAFV service list, the CLC peak directories
          for every state, the Law Council&rsquo;s constituent-body register and the Australian Pro
          Bono Centre&rsquo;s scheme directory. 396 records came back, deduplicated to{' '}
          {orgs.length}. The &ldquo;on the radar&rdquo; mark is fuzzy name-matching against the
          sources table and errs towards understating coverage. Each researcher&rsquo;s own account
          of what it could not establish is below — read these before relying on any single row.
        </p>
        {RESEARCH_NOTES.map((n, i) => (
          <details className="sector-note" key={i}>
            <summary>{n.split(':')[0].slice(0, 60)}</summary>
            <p>{n}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
