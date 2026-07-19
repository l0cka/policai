import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { buildNetworkData } from './network-data';

describe('buildNetworkData', () => {
  it('preserves the primary policy date precision for public display', () => {
    const policy = buildPolicy({
      dates: [
        {
          type: 'amended',
          date: '2025-07-01',
          precision: 'month',
          primary: true,
          source: {
            url: 'https://example.gov.au/policies/national-ai-ethics-framework',
          },
        },
      ],
      effectiveDate: '2025-07-01',
    });

    const { nodes } = buildNetworkData([policy]);

    expect(nodes[0]).toMatchObject({
      effectiveDate: '2025-07-01',
      dateType: 'amended',
      datePrecision: 'month',
    });
  });
});
