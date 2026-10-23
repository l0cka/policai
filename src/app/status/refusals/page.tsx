import type { Metadata } from 'next';
import Link from 'next/link';
import { getBodies, getSourceHealth } from '@/lib/data-service';
import { COLLECTOR_IDENTITY_TOKEN } from '@/lib/pipeline/identity';
import { WATCH_SOURCES } from '@/lib/pipeline/sources';
import {
  siteRefusals,
  type RefusalKind,
  type RefusalResponse,
} from '@/lib/watch-coverage/refusals';
import { MetricStrip, PageIntro } from '@/components/layout';
import { getJurisdictionName } from '@/types';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const TITLE = 'Sites that refuse Policai';
const DESCRIPTION =
  'Official websites that block Policai’s declared collector, how each refuses, and how Policai covers it instead.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates('/status/refusals'),
  ...pageSocialMeta({ title: TITLE, description: DESCRIPTION, path: '/status/refusals' }),
};

const KIND_LABEL: Record<RefusalKind, string> = {
  identity_refused: 'Refuses the declared identity',
  bot_blocked: 'Blocks automated access',
  robots_disallowed: 'robots.txt disallows Policai',
};

const RESPONSE_LABEL: Record<RefusalResponse, string> = {
  manual: 'Checked by hand',
  await_allowlist: 'Checked by hand; allow-list requested',
  undecided: 'Still requested each run; decision pending',
};

const HEADER_CELL =
  'py-2.5 pr-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground';
const WIDE_ONLY = 'hidden sm:table-cell';

function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function RefusalsPage() {
  const [bodies, sourceHealth] = await Promise.all([getBodies(), getSourceHealth()]);
  const rows = siteRefusals({ bodies, sources: WATCH_SOURCES, sourceHealth });
  const jurisdictions = [...new Set(rows.map((row) => row.jurisdiction))];

  return (
    <article className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro eyebrow="About · sources" title={TITLE} description={DESCRIPTION} />
      <MetricStrip
        metrics={[
          { value: rows.length, label: 'sources refused' },
          { value: new Set(rows.map((row) => row.host)).size, label: 'websites' },
          { value: new Set(rows.filter((row) => row.tier === 'A').map((row) => row.bodyName)).size, label: 'tier A bodies' },
          { value: rows.filter((row) => row.response === 'undecided').length, label: 'awaiting a decision' },
        ]}
      />
      <div className="space-y-10 py-9 text-sm leading-6">
        <section>
          <p className="max-w-3xl text-muted-foreground">
            Policai’s collector identifies itself as{' '}
            <code className="text-xs">{COLLECTOR_IDENTITY_TOKEN}</code> and follows
            robots.txt. When a site refuses it, Policai respects the block and
            does not disguise its identity. A person checks the source by hand
            on its usual cadence instead, so it stays covered. Tier A bodies
            are each government’s central, digital or AI and drafting bodies,
            plus the federal policy departments, regulators and Parliament.
            See{' '}
            <Link href="/status" className="text-primary underline underline-offset-4 hover:no-underline">
              source status
            </Link>{' '}
            for the full watch coverage.
          </p>
        </section>

        {rows.length === 0 ? (
          <p className="text-muted-foreground">No watched site refuses Policai at present.</p>
        ) : (
          jurisdictions.map((jurisdiction) => (
            <section key={jurisdiction} className="border-t border-border pt-7">
              <h2 className="section-title">{getJurisdictionName(jurisdiction)}</h2>
              <div
                className="overflow-x-auto"
                role="region"
                aria-label={`Sites that refuse Policai, ${getJurisdictionName(jurisdiction)}`}
                tabIndex={0}
              >
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-[var(--rule-heavy)]">
                      <th scope="col" className={HEADER_CELL}>Body</th>
                      <th scope="col" className={HEADER_CELL}>Source</th>
                      <th scope="col" className={HEADER_CELL}>How it refuses</th>
                      <th scope="col" className={`${HEADER_CELL} ${WIDE_ONLY}`}>Since</th>
                      <th scope="col" className={HEADER_CELL}>What Policai does</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((row) => row.jurisdiction === jurisdiction)
                      .map((row) => (
                        <tr key={row.sourceId} className="border-b border-border">
                          <td className="py-2.5 pr-3 align-top">
                            {row.bodyName}
                            {row.tier ? (
                              <span className="block font-mono text-xs text-muted-foreground">
                                Tier {row.tier}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            {row.sourceName}
                            <code className="block text-xs text-muted-foreground">{row.host}</code>
                          </td>
                          <td className="py-2.5 pr-3 align-top text-muted-foreground">
                            {KIND_LABEL[row.kind]}
                            {row.linked ? ' (a linked document)' : null}
                          </td>
                          <td className={`py-2.5 pr-3 align-top text-muted-foreground ${WIDE_ONLY}`}>
                            {day(row.since)}
                          </td>
                          <td className="py-2.5 align-top">{RESPONSE_LABEL[row.response]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          “Since” is the date the decision was recorded, or the first refused
          run for a refusal still awaiting a decision. The evidence for each
          decision is kept with the source in Policai’s source catalogue, in
          its public code repository.
        </p>
      </div>
    </article>
  );
}
