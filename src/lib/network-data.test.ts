import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import {
  buildNetworkData,
  getNetworkConnections,
  nodeMatchesTheme,
} from './network-data';

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

  it('keeps relationship evidence human-readable while excluding metadata tags', () => {
    const federalCourt = buildPolicy({
      id: 'federal-court',
      title: 'Federal Court AI guidance',
      jurisdiction: 'federal',
      tags: ['AI', 'courts', 'judicial', 'disclosure'],
    });
    const nswCourt = buildPolicy({
      id: 'nsw-court',
      title: 'NSW Court AI guidance',
      jurisdiction: 'nsw',
      tags: ['AI', 'courts', 'judicial', 'disclosure', 'practice note'],
    });
    const isolated = buildPolicy({
      id: 'isolated',
      title: 'Unconnected policy',
      jurisdiction: 'tas',
      tags: ['AI infrastructure'],
    });

    const { nodes, edges, summary } = buildNetworkData([
      federalCourt,
      nswCourt,
      isolated,
    ]);

    expect(edges).toContainEqual(
      expect.objectContaining({
        source: 'federal-court',
        target: 'nsw-court',
        kind: 'thematic',
        crossJurisdiction: true,
        sharedThemes: ['courts', 'judicial', 'disclosure'],
      }),
    );
    expect(summary).toMatchObject({
      policyCount: 3,
      thematicallyConnectedCount: 2,
      isolatedCount: 1,
      crossJurisdictionLinkCount: 1,
      insight: 'Court guidance forms the clearest cross-jurisdiction cluster.',
    });
    expect(nodes.find((node) => node.id === 'federal-court')).toMatchObject({
      thematicDegree: 1,
      formalDegree: 0,
    });
  });

  it('separates directed formal supersession from inferred thematic proximity', () => {
    const replacement = buildPolicy({
      id: 'replacement',
      title: 'Replacement guidance',
      tags: ['assurance'],
    });
    const superseded = buildPolicy({
      id: 'superseded',
      title: 'Superseded guidance',
      status: 'superseded',
      supersededBy: 'replacement',
      tags: ['AI ethics'],
    });

    const { nodes, edges, summary } = buildNetworkData([
      superseded,
      replacement,
    ]);
    const formalEdge = edges.find((edge) => edge.kind === 'formal');

    expect(formalEdge).toMatchObject({
      source: 'superseded',
      target: 'replacement',
      formalRelationship: 'superseded_by',
      sharedThemes: [],
    });
    expect(summary).toMatchObject({
      thematicallyConnectedCount: 0,
      isolatedCount: 2,
      formalRelationshipCount: 1,
    });
    expect(getNetworkConnections('superseded', nodes, edges)).toEqual([
      expect.objectContaining({
        formalLabel: 'Superseded by',
        kinds: ['formal'],
        node: expect.objectContaining({ id: 'replacement' }),
      }),
    ]);
    expect(getNetworkConnections('replacement', nodes, edges)[0]).toMatchObject({
      formalLabel: 'Supersedes',
    });
  });

  it('matches theme filters case-insensitively', () => {
    const { nodes } = buildNetworkData([
      buildPolicy({ tags: ['AI governance', 'Risk Management'] }),
    ]);

    expect(nodeMatchesTheme(nodes[0], 'risk management')).toBe(true);
    expect(nodeMatchesTheme(nodes[0], 'courts')).toBe(false);
    expect(nodeMatchesTheme(nodes[0], null)).toBe(true);
  });
});
