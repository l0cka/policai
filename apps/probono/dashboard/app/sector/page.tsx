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
    'A researched directory of organisations and programs that fund, coordinate, deliver or study legal assistance in Australia, with the funding and referral structure that connects them.',
};

export default async function SectorPage() {
  // The sector reference is file-backed and remains useful in a local checkout
  // without Postgres. Production still fails loudly if a configured database
  // cannot be queried; only an intentionally absent DATABASE_URL falls back.
  const monitoringAvailable = Boolean(process.env.DATABASE_URL);
  const { rows } = monitoringAvailable
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
        <SectorExplorer orgs={orgs} monitoringAvailable={monitoringAvailable} />
      </section>

      <dl className="stat-strip reveal reveal-1" aria-label="Sector snapshot">
        <div className="stat">
          <dd>{orgs.length}</dd>
          <dt>directory records</dt>
        </div>
        <div className="stat">
          <dd>{locations.locations.length}</dd>
          <dt>primary offices mapped</dt>
        </div>
        <div className="stat">
          <dd>9</dd>
          <dt>jurisdictions</dt>
        </div>
        <div className="stat">
          <dd>{monitoringAvailable ? monitored : '—'}</dd>
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
                <td>Estimated $3.863790 billion GST exclusive; publicly rounded to $3.9 billion</td>
              </tr>
              <tr>
                <th scope="row">CLC and women&rsquo;s legal services share</th>
                <td>$833 million, a 74% increase on the previous agreement</td>
              </tr>
              <tr>
                <th scope="row">Replaced</th>
                <td>National Legal Assistance Partnership (NLAP) 2020–25, expired 30 June 2025</td>
              </tr>
              <tr>
                <th scope="row">Separate Commonwealth program</th>
                <td>
                  Community Legal Services Program 2025–30: $67.5 million for national peaks,
                  national services and self-representation services outside the NAJP
                </td>
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
          {orgs.length} researched organisation and program records by primary tier. Core provider
          networks are directory-based; contextual ecosystem tiers are selective rather than an
          exhaustive census.{' '}
          {monitoringAvailable
            ? 'A green dot marks an active radar source.'
            : 'Live radar-source coverage is unavailable in this local preview.'}
        </p>
        <SectorDirectory orgs={orgs} monitoringAvailable={monitoringAvailable} />
      </section>

      <section aria-label="Method" className="sector-method">
        <h2 className="section-heading">Method</h2>
        <p className="section-intro">
          Compiled {COMPILED} from published member and service directories: National Legal Aid,
          CLCs Australia and its state and territory associations, WLSA, NATSILS, FNAAFV, the Law
          Council&rsquo;s constituent-body register and the Australian Pro Bono Centre&rsquo;s scheme
          directory. Names, roles and URLs come from each organisation&rsquo;s own site or its
          peak&rsquo;s directory where available.
        </p>
        <p className="section-intro">
          Funding attributions are indicative and not audited. An organisation counts as a radar
          source when an active source shares its website; a few sources publish from a different
          domain than the one recorded here and are not matched.
        </p>
        <p className="section-intro">
          Primary-office locations on the map were compiled {locations.checked} from each
          organisation&rsquo;s own website or its peak body&rsquo;s directory (the source page is
          linked on each record) and geocoded with OpenStreetMap Nominatim. The map is not a
          representation of every branch, outreach site, national or online service, cross-border
          service footprint or overlapping funded program.{' '}
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
