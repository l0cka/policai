import { notFound } from 'next/navigation';
import Link from 'next/link';
import { type Policy } from '@/types';
import { getPolicyById, getPolicies } from '@/lib/data-service';
import { PolicyDetailTabs } from './policy-detail-tabs';

async function getRelatedPolicies(currentPolicy: Policy): Promise<Policy[]> {
  const policies = await getPolicies();
  return policies
    .filter(p => p.id !== currentPolicy.id && p.status !== 'trashed')
    .filter(p =>
      p.jurisdiction === currentPolicy.jurisdiction ||
      p.tags.some(tag => currentPolicy.tags.includes(tag))
    )
    .slice(0, 3);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) return { title: 'Policy Not Found — Policai' };
  return {
    title: `${policy.title} — Policai`,
    description: policy.description,
    keywords: policy.tags,
  };
}

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) notFound();

  const relatedPolicies = await getRelatedPolicies(policy);

  return (
    <div className="container mx-auto px-4 py-6">
      <nav className="font-mono text-xs text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">Policies</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{policy.title}</span>
      </nav>

      <PolicyDetailTabs policy={policy} relatedPolicies={relatedPolicies} />
    </div>
  );
}
