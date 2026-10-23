import type { Metadata } from 'next';
import { FollowingList, type FollowingPolicy } from '@/components/follow-control';
import { PageIntro } from '@/components/layout';
import { getPolicies } from '@/lib/data-service';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

const FOLLOWING_TITLE = 'Following';
const FOLLOWING_DESCRIPTION =
  'Australian AI policy records followed in this browser. Follows stay on this device and are not an account.';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: FOLLOWING_TITLE,
  description: FOLLOWING_DESCRIPTION,
  // Follows live in this browser, so a crawler only ever sees the empty list.
  robots: { index: false, follow: true },
  alternates: pageAlternates('/following'),
  ...pageSocialMeta({
    title: FOLLOWING_TITLE,
    description: FOLLOWING_DESCRIPTION,
    path: '/following',
  }),
};

export default async function FollowingPage() {
  const policies = await getPolicies();
  const rows: FollowingPolicy[] = policies.map((policy) => ({
    id: policy.id,
    title: policy.title,
    jurisdiction: policy.jurisdiction,
    themes: policy.themes,
    type: policy.type,
  }));

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title={FOLLOWING_TITLE}
        description="Records followed on this browser only. A different browser, or a new profile, starts empty. There is no account and nothing is emailed."
      />
      <FollowingList policies={rows} />
    </div>
  );
}
