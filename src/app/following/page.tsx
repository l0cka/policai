import type { Metadata } from 'next';
import Link from 'next/link';
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
      <p className="text-sm">
        <Link href="/this-week" className="text-primary underline underline-offset-4">
          This week in Australian AI policy
        </Link>
      </p>
      <FollowingList policies={rows} />
    </div>
  );
}
