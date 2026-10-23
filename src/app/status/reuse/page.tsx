import type { Metadata } from 'next';
import Link from 'next/link';
import { getBodies, getSiteReuse } from '@/lib/data-service';
import {
  creativeCommonsTerms,
  reuseLabel,
  siteReuseRows,
  type SiteReuse,
} from '@/lib/watch-coverage/site-reuse';
import { MetricStrip, PageIntro } from '@/components/layout';
import { getJurisdictionName } from '@/types';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const TITLE = 'Reuse terms of official sites';
const DESCRIPTION =
  'What each government website Policai watches says about copying and reusing its material, with the page that says it and when Policai last checked.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates('/status/reuse'),
  ...pageSocialMeta({ title: TITLE, description: DESCRIPTION, path: '/status/reuse' }),
};

const HEADER_CELL =
  'py-2.5 pr-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground';
const WIDE_ONLY = 'hidden sm:table-cell';
const LINK = 'text-primary underline underline-offset-4 hover:no-underline';

function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Terms({ entry }: { entry: SiteReuse | undefined }) {
  if (!entry) return <span className="text-muted-foreground">Not yet checked</span>;
  if (entry.status !== 'stated')
    return (
      <>
        <span className="text-muted-foreground">{reuseLabel(entry)}</span>
        <span className="block text-xs text-muted-foreground">{entry.note}</span>
      </>
    );
  const { terms } = entry;
  if (terms.kind === 'creative_commons') {
    const licence = creativeCommonsTerms(terms.licence)!;
    return (
      <>
        <a href={licence.url} className={LINK} rel="license noopener noreferrer" target="_blank">
          {licence.label}
        </a>
        {terms.exceptions ? (
          <span className="block text-xs text-muted-foreground">Except {terms.exceptions}</span>
        ) : null}
      </>
    );
  }
  return (
    <>
      {reuseLabel(entry)}
      <span className="block text-xs text-muted-foreground">{terms.summary}</span>
    </>
  );
}

export default async function ReusePage() {
  const [bodies, entries] = await Promise.all([getBodies(), getSiteReuse()]);
  const rows = siteReuseRows(bodies, entries);
  const jurisdictions = [...new Set(rows.map((row) => row.jurisdiction))];
  const stated = entries.filter((entry) => entry.status === 'stated');

  return (
    <article className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro eyebrow="About · sources" title={TITLE} description={DESCRIPTION} />
      <MetricStrip
        metrics={[
          { value: rows.length, label: 'websites' },
          {
            value: stated.filter((entry) => entry.terms.kind === 'creative_commons').length,
            label: 'Creative Commons',
          },
          {
            value: stated.filter((entry) => entry.terms.kind !== 'creative_commons').length,
            label: 'other terms',
          },
          { value: rows.filter((row) => row.entry?.status !== 'stated').length, label: 'unknown' },
        ]}
      />
      <div className="space-y-10 py-9 text-sm leading-6">
        <section>
          <p className="max-w-3xl text-muted-foreground">
            Most of the sites Policai has checked license their content under
            Creative Commons, usually excluding the Coat of Arms, logos and
            material owned by others. Courts, parliaments and some agencies
            keep their own terms. This is a summary of what each site’s
            copyright page said when Policai checked it, not legal advice:
            read the linked page before you reuse anything, and check the
            terms on the document itself, which can differ from the site’s.
            The sites are those listed in{' '}
            <Link href="/status" className={LINK}>
              source status
            </Link>
            .
          </p>
        </section>

        {jurisdictions.map((jurisdiction) => (
          <section key={jurisdiction} className="border-t border-border pt-7">
            <h2 className="section-title">{getJurisdictionName(jurisdiction)}</h2>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label={`Reuse terms, ${getJurisdictionName(jurisdiction)}`}
              tabIndex={0}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-y border-[var(--rule-heavy)]">
                    <th scope="col" className={HEADER_CELL}>Site</th>
                    <th scope="col" className={HEADER_CELL}>Terms</th>
                    <th scope="col" className={`${HEADER_CELL} ${WIDE_ONLY}`}>Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((row) => row.jurisdiction === jurisdiction)
                    .map((row) => (
                      <tr key={row.host} className="border-b border-border">
                        <td className="py-2.5 pr-3 align-top">
                          {row.bodyNames.join('; ')}
                          {row.entry?.status === 'stated' ? (
                            <a href={row.entry.termsUrl} className={`block text-xs ${LINK}`}>
                              {row.host}
                            </a>
                          ) : (
                            <code className="block text-xs text-muted-foreground">{row.host}</code>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 align-top">
                          <Terms entry={row.entry} />
                        </td>
                        <td className={`py-2.5 align-top text-muted-foreground ${WIDE_ONLY}`}>
                          {row.entry ? day(row.entry.checkedAt) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          Each site links to the copyright page Policai read. “Unknown” counts
          sites that refuse Policai’s declared collector and sites whose terms
          Policai has not yet found.
        </p>
      </div>
    </article>
  );
}
