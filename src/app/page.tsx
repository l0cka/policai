import { PolicyBrowser } from '@/components/policy-browser';
import {
  getCollectionMeta,
  getDevelopments,
  getPolicies,
} from '@/lib/data-service';

export default async function HomePage() {
  const [policies, developments, meta] = await Promise.all([
    getPolicies(),
    getDevelopments({ limit: 6 }),
    getCollectionMeta(),
  ]);

  return (
    <PolicyBrowser
      policies={policies}
      developments={developments}
      lastCollectedAt={meta.lastCollectedAt}
      lastReviewedAt={meta.lastReviewedAt}
    />
  );
}
