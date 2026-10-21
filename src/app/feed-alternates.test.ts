import { expect, it } from 'vitest';
import { metadata as home } from './page';
import { metadata as courts } from './courts/page';
import { metadata as coverage } from './coverage/page';
import { metadata as developments } from './developments/page';
import { metadata as methodology } from './methodology/page';
import { metadata as status } from './status/page';
import { metadata as thisWeek } from './this-week/page';
import { metadata as timeline } from './timeline/page';
import { metadata as analysis } from './analysis/page';
import { generateMetadata as policyMetadata } from './policies/[id]/page';
import { generateMetadata as articleMetadata } from './analysis/[slug]/page';
import { getArticles, getPolicies } from '@/lib/data-service';
import type { Metadata } from 'next';

const FEEDS = [
  { url: 'https://policai.org/feed.xml', title: 'Policai register feed' },
  { url: 'https://policai.org/analysis/feed.xml', title: 'Policai analysis' },
];

function expectBothFeeds(metadata: Metadata, canonical: string) {
  expect(metadata.alternates).toEqual({
    canonical,
    types: { 'application/atom+xml': FEEDS },
  });
}

it.each([
  ['/', home],
  ['/courts', courts],
  ['/coverage', coverage],
  ['/developments', developments],
  ['/methodology', methodology],
  ['/status', status],
  ['/this-week', thisWeek],
  ['/timeline', timeline],
  ['/analysis', analysis],
] as const)('advertises both Atom feeds on %s', (canonical, metadata) => {
  expectBothFeeds(metadata, canonical);
});

it('advertises both Atom feeds on a register record', async () => {
  const [policy] = await getPolicies();
  expect(policy).toBeDefined();
  const metadata = await policyMetadata({
    params: Promise.resolve({ id: policy.id }),
  });
  expectBothFeeds(metadata, `/policies/${policy.id}`);
});

it('advertises both Atom feeds on a published analysis piece', async () => {
  const [article] = await getArticles();
  expect(article).toBeDefined();
  const metadata = await articleMetadata({
    params: Promise.resolve({ slug: article.slug }),
  });
  expectBothFeeds(metadata, `/analysis/${article.slug}`);
});
