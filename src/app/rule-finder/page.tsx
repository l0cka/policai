import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageIntro } from '@/components/layout';
import { RuleFinder } from '@/components/rule-finder';
import { getPolicies, getRuleScopes } from '@/lib/data-service';
import { reviewedRuleCount, type FinderPolicy } from '@/lib/rule-finder/scope';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';

export const revalidate = 3600;

const RULE_FINDER_TITLE = 'Which AI rules name organisations like yours?';
const RULE_FINDER_DESCRIPTION =
  'Answer a few questions about who you are and where you work, and see the Australian AI laws, policies and guidance that name organisations like yours, quoted from each instrument.';

export const metadata: Metadata = {
  title: 'AI rule finder',
  description: RULE_FINDER_DESCRIPTION,
  alternates: pageAlternates('/rule-finder'),
  ...pageSocialMeta({
    title: 'AI rule finder',
    description: RULE_FINDER_DESCRIPTION,
    path: '/rule-finder',
  }),
};

export default async function RuleFinderPage() {
  const [scopes, policies] = await Promise.all([getRuleScopes(), getPolicies()]);
  // The finder ships dark until an editor has reviewed some scope entries.
  if (reviewedRuleCount(scopes) === 0) notFound();

  const reviewed = scopes.filter((scope) => scope.kind === 'rule' && scope.review.status === 'reviewed');
  const rows: FinderPolicy[] = policies.map(({ id, title, jurisdiction, status }) => ({
    id,
    title,
    jurisdiction,
    status,
  }));

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title={RULE_FINDER_TITLE}
        eyebrow="Register · rule finder"
        description="Answer up to ten questions. Your answers stay in this page's address and are not stored. The finder shows what each instrument says about whom it covers. It does not tell you whether you comply."
      />
      <RuleFinder scopes={reviewed} policies={rows} />
    </div>
  );
}
