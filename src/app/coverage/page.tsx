import type { Metadata } from 'next';
import { CoverageMap } from '@/components/coverage-map';
import { getPolicies } from '@/lib/data-service';
import { buildCoverageData, coverageStandfirst } from '@/lib/coverage-data';
import { THEMES } from '@/lib/themes';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';
import './coverage.css';

export const revalidate = 3600;

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

// Prerendered: the map reads its selection from the query string itself.
export default async function CoveragePage() {
  const data = buildCoverageData(await getPolicies(), THEMES);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <header className="coverage-header">
        <h1 className="page-title">What Australian AI policy covers</h1>
        <p className="coverage-standfirst">
          {['Which themes each jurisdiction has a verified instrument for.', ...coverageStandfirst(data)].join(' ')}
        </p>
      </header>
      <CoverageMap data={data} />
    </div>
  );
}
