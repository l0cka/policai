import type { Metadata } from 'next';
import { CourtsAnalysis } from '@/components/courts-analysis';
import { CourtsBrowser } from '@/components/courts-browser';
import { getPublicCourtRequirements } from '@/lib/court-requirements';
import {
  analysesByCourtPolicy,
  courtFocusedAnalyses,
  relatedByCourtPolicy,
} from '@/lib/court-cross-links';
import { getArticles, getPolicies } from '@/lib/data-service';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Courts & Tribunals - Policai',
  description:
    'Verified Australian court practice notes, directions, and guidance governing the use of artificial intelligence in proceedings.',
};

export default async function CourtsPage() {
  const [policies, publicPolicies, requirements, articles] = await Promise.all([
    getPolicies({ type: 'practice_note' }),
    getPolicies(),
    getPublicCourtRequirements(),
    getArticles(),
  ]);
  const courtIds = new Set(policies.map((policy) => policy.id));
  const courtAnalyses = courtFocusedAnalyses(articles, courtIds);
  const analysesByPolicy = analysesByCourtPolicy(articles, courtIds);
  const relatedByPolicy = relatedByCourtPolicy(policies, publicPolicies);

  return (
    <CourtsBrowser
      policies={policies}
      requirements={requirements}
      analysesByPolicy={analysesByPolicy}
      relatedByPolicy={relatedByPolicy}
      analysis={<CourtsAnalysis articles={courtAnalyses} />}
    />
  );
}
