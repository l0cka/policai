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

  it('connects records by shared themes and labels them for display', () => {
    const federalCourt = buildPolicy({
      id: 'federal-court',
      title: 'Federal Court AI guidance',
      jurisdiction: 'federal',
      themes: ['courts-tribunals', 'generative-ai', 'transparency-disclosure'],
    });
    const nswCourt = buildPolicy({
      id: 'nsw-court',
      title: 'NSW Court AI guidance',
      jurisdiction: 'nsw',
      themes: [
        'courts-tribunals',
        'generative-ai',
        'transparency-disclosure',
        'legal-practice',
      ],
    });
    const isolated = buildPolicy({
      id: 'isolated',
      title: 'Unconnected policy',
      jurisdiction: 'tas',
      themes: ['infrastructure'],
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
        sharedThemes: [
          'Courts and tribunals',
          'Generative AI',
          'Transparency and disclosure',
        ],
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
      themes: ['risk-assurance'],
    });
    const superseded = buildPolicy({
      id: 'superseded',
      title: 'Superseded guidance',
      status: 'superseded',
      supersededBy: 'replacement',
      themes: ['responsible-ai'],
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

  it('matches theme filters by theme id', () => {
    const { nodes } = buildNetworkData([
      buildPolicy({
        tags: ['risk management'],
        themes: ['ai-governance', 'risk-assurance'],
      }),
    ]);

    expect(nodeMatchesTheme(nodes[0], 'risk-assurance')).toBe(true);
    expect(nodeMatchesTheme(nodes[0], 'risk management')).toBe(false);
    expect(nodeMatchesTheme(nodes[0], 'courts-tribunals')).toBe(false);
    expect(nodeMatchesTheme(nodes[0], null)).toBe(true);
  });
});
