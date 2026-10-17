import type { Metadata } from 'next';
import { CoverageMap } from '@/components/coverage-map';
import { getPolicies } from '@/lib/data-service';
import {
  buildCoverageData,
  coverageStandfirst,
  parseCoverageViewState,
} from '@/lib/coverage-data';
import { THEMES } from '@/lib/themes';
import './coverage.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Australian AI Policy Coverage Map - Policai',
  description:
    'Which AI policy themes each Australian jurisdiction has a verified instrument for, and where there is none.',
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
        <p className="page-eyebrow">Coverage map</p>
        <h1 className="page-title mt-2">What Australian AI policy covers</h1>
        <p className="coverage-standfirst">
          {['Which themes each jurisdiction has a verified instrument for.', ...coverageStandfirst(data)].join(' ')}
        </p>
      </header>
      <CoverageMap data={data} initialState={initialState} />
    </div>
  );
}
