import type { Metadata } from 'next';
import { CoverageMap } from '@/components/coverage-map';
import { getPolicies } from '@/lib/data-service';
import {
  buildCoverageData,
  coverageStandfirst,
  parseCoverageViewState,
} from '@/lib/coverage-data';
import { THEMES } from '@/lib/themes';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';
import './coverage.css';

export const dynamic = 'force-dynamic';

const COVERAGE_TITLE = 'Australian AI policy coverage by theme';
const COVERAGE_DESCRIPTION =
  'Which AI policy themes each Australian jurisdiction has a verified instrument for, and where there is none.';

export const metadata: Metadata = {
  title: COVERAGE_TITLE,
  description: COVERAGE_DESCRIPTION,
  alternates: pageAlternates('/coverage'),
  ...pageSocialMeta({
    title: COVERAGE_TITLE,
    description: COVERAGE_DESCRIPTION,
    path: '/coverage',
  }),
};

function toUrlSearchParams(value: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, entry] of Object.entries(value)) {
    const first = Array.isArray(entry) ? entry[0] : entry;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = buildCoverageData(await getPolicies(), THEMES);
  const initialState = parseCoverageViewState(toUrlSearchParams(await searchParams), data);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <header className="coverage-header">
        <h1 className="page-title">What Australian AI policy covers</h1>
        <p className="coverage-standfirst">
          {['Which themes each jurisdiction has a verified instrument for.', ...coverageStandfirst(data)].join(' ')}
        </p>
      </header>
      <CoverageMap data={data} initialState={initialState} />
    </div>
  );
}
