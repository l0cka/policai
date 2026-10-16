import { expect, it, vi } from 'vitest';
import type { Development } from '@/types';

const feed = [
  { id: 'dev-live', status: 'detected', jurisdiction: 'federal', title: 'Live', sourceId: 's' },
  { id: 'dev-gone', status: 'dismissed', jurisdiction: 'federal', title: 'Gone', sourceId: 's' },
] as Development[];

vi.mock('@/lib/data-service', () => ({
  getDevelopments: async () => feed,
  getCollectionMeta: async () => ({
    lastCollectedAt: null,
    collector: {
      health: 'healthy',
      successfulSourceCount: 0,
      dueSourceCount: 0,
      automaticSourceCount: 0,
    },
  }),
  getSourceMonitoring: async () => ({ manualReviews: [] }),
}));

import DevelopmentsPage from '@/app/developments/page';

it('passes no dismissed development to the anchored feed', async () => {
  const element = await DevelopmentsPage();
  const ids = (element.props.developments as Development[]).map((item) => item.id);

  expect(ids).toEqual(['dev-live']);
  expect(Object.keys(element.props.streamById)).toEqual(['dev-live']);
});
