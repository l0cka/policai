import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticles, getPolicyById, getPolicies } from '@/lib/data-service';
import { getPublicCourtRequirements } from '@/lib/court-requirements';
import { CitedInAnalysis } from '@/components/related/cited-in-analysis';
import { RelatedInstruments } from '@/components/related/related-instruments';
import { relatedInstruments } from '@/lib/related-policies';
import { PolicyDetailTabs } from './policy-detail-tabs';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) return { title: 'Policy Not Found - Policai' };
  return {
    title: `${policy.title} - Policai`,
    description: policy.description,
    keywords: policy.tags,
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
