import Link from 'next/link';
import { getPool } from '../../lib/db';
import SectorDirectory from '../sector-directory';
import SectorExplorer from '../sector-explorer';
import {
  COMPILED,
  ORGANISATIONS,
  RESEARCH_NOTES,
  TIERS,
  markMonitored,
  type TierKey,
} from '../../lib/sector-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'The sector — Policai A2J',
  description:
    'Every organisation that funds, coordinates, delivers or studies legal assistance in Australia, and the funding and referral structure that connects them.',
};

const TIER_LABEL = Object.fromEntries(TIERS.map((t) => [t.key, t.label])) as Record<
  TierKey,
  string
>;

export default async function SectorPage() {
  // The sector reference is file-backed and remains useful in a local checkout
  // without Postgres. Production still fails loudly if a configured database
  // cannot be queried; only an intentionally absent DATABASE_URL falls back.
  const rows = process.env.DATABASE_URL
    ? (await getPool().query(`SELECT name, url FROM sources WHERE active`)).rows
    : [];
  const orgs = markMonitored(
    ORGANISATIONS,
    rows.map((r) => ({ name: r.name as string, url: r.url as string })),
  );

  const monitored = orgs.filter((o) => o.monitored).length;
  const coverage = TIERS.map((t) => {
    const inTier = orgs.filter((o) => o.tier === t.key);
    return {
      key: t.key,
      total: inTier.length,
      monitored: inTier.filter((o) => o.monitored).length,
    };
  });

  return (
    <div className="container page">
      <section aria-labelledby="sector-explorer-title" className="sector-hero reveal">
        <header className="sector-hero-head">
          <p className="page-eyebrow">Sector reference · compiled {COMPILED}</p>
          <h1 id="sector-explorer-title" className="section-heading">Funding and referral structure</h1>
          <p className="section-intro">Explore by jurisdiction.</p>
        </header>
        <SectorExplorer orgs={orgs} />
      </section>

      <dl className="stat-strip reveal reveal-1" aria-label="Sector snapshot">
        <div className="stat">
          <dd>{orgs.length}</dd>
          <dt>organisations</dt>
        </div>
        <div className="stat">
          <dd>{TIERS.length}</dd>
          <dt>kinds of body</dt>
        </div>
        <div className="stat">
          <dd>9</dd>
          <dt>jurisdictions</dt>
        </div>
        <div className="stat">
          <dd>{monitored}</dd>
          <dt>radar sources</dt>
        </div>
        <div className="stat">
          <dd>$3.9b</dd>
          <dt>NAJP 2025–30</dt>
        </div>
      </dl>

      <section aria-label="The National Access to Justice Partnership">
        <h2 className="section-heading">The funding agreement</h2>
        <div
          className="table-wrap"
          role="region"
          aria-label="National Access to Justice Partnership facts"
          tabIndex={0}
        >
          <table>
            <tbody>
              <tr>
                <th scope="row">Current agreement</th>
                <td>National Access to Justice Partnership (NAJP) 2025–30</td>
              </tr>
              <tr>
                <th scope="row">Term</th>
                <td>1 July 2025 to 30 June 2030</td>
              </tr>
              <tr>
                <th scope="row">Value</th>
                <td>$3.9 billion over five years</td>
              </tr>
              <tr>
                <th scope="row">CLC and women&rsquo;s legal services share</th>
                <td>$833 million, a 74% increase on the previous agreement</td>
              </tr>
              <tr>
                <th scope="row">Replaced</th>
                <td>National Legal Assistance Partnership (NLAP) 2020–25, expired 30 June 2025</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="section-note">
          Recent renames: the National Association of Community Legal Centres became Community
          Legal Centres Australia in 2020; the National FVPLS Forum became First Nations Advocates
          Against Family Violence.
        </p>
      </section>

      <section aria-label="Radar coverage">
        <h2 className="section-heading">Radar coverage</h2>
        <p className="section-intro">
          Organisations in each tier that are an active source on this radar. See{' '}
          <Link href="/health">source health</Link> for run status.
        </p>
        <div
          className="table-wrap"
          role="region"
          aria-label="Radar coverage by sector tier"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Sources</th>
                <th scope="col">Organisations</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.key}>
                  <td>{TIER_LABEL[c.key]}</td>
                  <td>
                    <span
                      className={c.monitored === 0 ? 'status status-failed' : 'status status-ok'}
                    >
                      {c.monitored}
                    </span>
                  </td>
                  <td className="cell-mono">{c.total}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="cell-mono">{monitored}</td>
                <td className="cell-mono">{orgs.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Directory">
        <h2 className="section-heading">Directory</h2>
        <p className="section-intro">
          All {orgs.length} organisations by tier. A green dot marks an active radar source.
        </p>
        <SectorDirectory orgs={orgs} />
      </section>

      <section aria-label="Method" className="sector-method">
        <h2 className="section-heading">Method</h2>
        <p className="section-intro">
          Compiled {COMPILED} from published member directories: the NATSILS member list, the
          FNAAFV service directory, the state CLC peak directories, the Law Council&rsquo;s
          constituent-body register and the Australian Pro Bono Centre&rsquo;s scheme directory.
          396 records were collected and deduplicated to {orgs.length}. Names, roles and URLs come
          from each organisation&rsquo;s own site or its peak&rsquo;s directory. Funding
          attributions are indicative and not audited. An organisation counts as a radar source
          when an active source shares its website; a few sources publish from a different domain
          than the one recorded here and are not matched.
        </p>
        {RESEARCH_NOTES.map((n, i) => (
          <details className="sector-note" key={i}>
            <summary>Limits of the {n.split(':')[0].slice(0, 40)} search</summary>
            <p>{n}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
