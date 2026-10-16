import { notFound } from 'next/navigation';
import Link from 'next/link';
import { type Policy } from '@/types';
import { getArticles, getPolicyById, getPolicies } from '@/lib/data-service';
import { AnalysisTierLabel, ArticleDate } from '@/components/analysis';
import { getPublicCourtRequirements } from '@/lib/court-requirements';
import { PolicyDetailTabs } from './policy-detail-tabs';

export const revalidate = 3600;

async function getRelatedPolicies(currentPolicy: Policy): Promise<Policy[]> {
  const policies = await getPolicies();
  const related = policies
    .filter(p => p.id !== currentPolicy.id && p.status !== 'trashed')
    .filter(p =>
      p.jurisdiction === currentPolicy.jurisdiction ||
      p.tags.some(tag => currentPolicy.tags.includes(tag))
    )
    .slice(0, 3);

  // The superseding instrument must always be resolvable for the banner.
  if (
    currentPolicy.supersededBy &&
    !related.some(p => p.id === currentPolicy.supersededBy)
  ) {
    const successor = policies.find(p => p.id === currentPolicy.supersededBy);
    if (successor) related.unshift(successor);
  }

  return related;
}

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

  const [relatedPolicies, analyses] = await Promise.all([
    getRelatedPolicies(policy),
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

      <PolicyDetailTabs policy={policy} relatedPolicies={relatedPolicies} courtRequirements={courtRequirements} />

      {analyses.length > 0 ? (
        <section aria-labelledby="cited-in-analysis" className="mt-10">
          <h2 id="cited-in-analysis" className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
            Analysis citing this record
          </h2>
          <ul>
            {analyses.map((article) => (
              <li key={article.slug} className="border-b border-border py-4">
                <AnalysisTierLabel type={article.type} />
                <Link href={`/analysis/${article.slug}`} className="record-title mt-1 inline-block hover:text-primary">
                  {article.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  <ArticleDate label="Published" date={article.publishedAt} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
