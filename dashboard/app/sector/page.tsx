import type { Metadata } from 'next';
import { getPool } from '../../lib/db';
import locations from '../../lib/sector-locations.json';
import SectorDirectory from '../sector-directory';
import SectorExplorer from '../sector-explorer';
import {
  COMPILED,
  ORGANISATIONS,
  RESEARCH_NOTES,
  markMonitored,
} from '../../lib/sector-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The sector — Policai A2J',
  description:
    'Every organisation that funds, coordinates, delivers or studies legal assistance in Australia, and the funding and referral structure that connects them.',
};

export default async function SectorPage() {
  // The sector reference is file-backed and remains useful in a local checkout
  // without Postgres. Production still fails loudly if a configured database
  // cannot be queried; only an intentionally absent DATABASE_URL falls back.
  const { rows } = process.env.DATABASE_URL
    ? await getPool().query<{ name: string; url: string }>(`SELECT name, url FROM sources WHERE active`)
    : { rows: [] };
  const orgs = markMonitored(
    ORGANISATIONS,
    rows.map((r) => ({ name: r.name as string, url: r.url as string })),
  );

  const monitored = orgs.filter((o) => o.monitored).length;

  return (
    <div className="container page">
      <section aria-labelledby="sector-explorer-title" className="sector-hero reveal">
        <header className="sector-hero-head">
          <p className="page-eyebrow">Sector reference · compiled {COMPILED}</p>
          <h1 id="sector-explorer-title" className="section-heading">Funding and referral structure</h1>
        </header>
        <SectorExplorer orgs={orgs} />
      </section>

      <dl className="stat-strip reveal reveal-1" aria-label="Sector snapshot">
        <div className="stat">
          <dd>{orgs.length}</dd>
          <dt>organisations</dt>
        </div>
        <div className="stat">
          <dd>{locations.locations.length}</dd>
          <dt>offices mapped</dt>
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
          from each organisation&rsquo;s own site or its peak&rsquo;s directory.
        </p>
        <p className="section-intro">
          Funding attributions are indicative and not audited. An organisation counts as a radar
          source when an active source shares its website; a few sources publish from a different
          domain than the one recorded here and are not matched.
        </p>
        <p className="section-intro">
          Primary-office locations on the map were compiled {locations.checked} from each
          organisation&rsquo;s own website or its peak body&rsquo;s directory (the source page is
          linked on each record) and geocoded with OpenStreetMap Nominatim.{' '}
          {locations.unresolved.length} organisations publish no verifiable address and are not
          mapped.
        </p>
        {RESEARCH_NOTES.map((n, i) => {
          const title = n.split(':')[0];
          return (
            <details className="sector-note" key={i}>
              <summary>{title.length > 72 ? `${title.slice(0, 71)}…` : title}</summary>
              <p>{n}</p>
            </details>
          );
        })}
      </section>
    </div>
  );
}
