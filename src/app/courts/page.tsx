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
import { pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const COURTS_TITLE = 'Court and tribunal AI guidance';
const COURTS_DESCRIPTION =
  'Verified Australian court and tribunal practice notes, directions and guidance on using AI in proceedings — for lawyers, litigants and court officers.';

export const metadata: Metadata = {
  title: COURTS_TITLE,
  description: COURTS_DESCRIPTION,
  alternates: { canonical: '/courts' },
  ...pageSocialMeta({
    title: COURTS_TITLE,
    description: COURTS_DESCRIPTION,
    path: '/courts',
  }),
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
