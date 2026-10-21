import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticles, getPolicyById, getPolicies } from '@/lib/data-service';
import { getPublicCourtRequirements } from '@/lib/court-requirements';
import { CitedInAnalysis } from '@/components/related/cited-in-analysis';
import { RelatedInstruments } from '@/components/related/related-instruments';
import { relatedInstruments } from '@/lib/related-policies';
import {
  pageAlternates,
  policyJsonLd,
  policyPageDescription,
  policyPageTitle,
  SITE_NAME,
  SITE_URL,
} from '@/lib/site-seo';
import { getJurisdictionName } from '@/types';
import { PolicyDetailTabs } from './policy-detail-tabs';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) return { title: 'Policy not found' };
  const title = policyPageTitle(policy);
  const description = policyPageDescription(policy);
  const url = `${SITE_URL}/policies/${policy.id}`;
  return {
    title,
    description,
    keywords: [
      ...policy.tags,
      getJurisdictionName(policy.jurisdiction),
      'Australian AI policy',
    ],
    alternates: pageAlternates(`/policies/${policy.id}`),
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: SITE_NAME,
      locale: 'en_AU',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) notFound();

  const [publicPolicies, analyses] = await Promise.all([
    getPolicies(),
    getArticles({ citing: id }),
  ]);
  const courtRequirements = policy.type === "practice_note" ? await getPublicCourtRequirements({ policyId: id }) : [];

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: policyJsonLd(policy) }}
      />
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        <Link href="/" className="hover:text-primary">Register</Link>
        <span className="mx-2">/</span>
        <span>{policy.jurisdiction}</span>
        <span className="mx-2">/</span>
        <span className="text-foreground">Policy</span>
      </nav>

      <PolicyDetailTabs
        policy={policy}
        courtRequirements={courtRequirements}
        related={
          <>
            <CitedInAnalysis articles={analyses} />
            <RelatedInstruments items={relatedInstruments(policy, publicPolicies)} />
          </>
        }
      />
    </div>
  );
}
