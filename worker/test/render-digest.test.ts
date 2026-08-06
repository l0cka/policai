import { describe, expect, it } from 'vitest';
import { renderDigest } from '../src/lib/render-digest.js';

const item = (id: number, title: string) => ({
  id, title, url: `https://example.org/${id}`, blurb: `Blurb for ${title}.`, source_name: 'Fixture',
});

describe('renderDigest', () => {
  it('puts opportunities first, groups streams, lists deadlines and failures', () => {
    const html = renderDigest({
      periodStart: new Date('2026-08-03T00:00:00Z'),
      periodEnd: new Date('2026-08-09T23:59:59Z'),
      dashboardUrl: 'http://100.87.255.67:8850',
      opportunities: [item(1, 'CLC seeks tech help')],
      byStream: { news: [item(2, 'Sector news piece')], funding: [item(3, 'Grant round opens')] },
      deadlines: [{ date: '2026-09-30', label: 'Applications close', itemTitle: 'Grant round opens' }],
      failedSources: ['NSW Law Reform Commission'],
    });
    expect(html.indexOf('CLC seeks tech help')).toBeLessThan(html.indexOf('Sector news piece'));
    expect(html).toContain('Opportunities');
    expect(html).toContain('Upcoming deadlines');
    expect(html).toContain('2026-09-30');
    expect(html).toContain('NSW Law Reform Commission');
    expect(html).toContain('http://100.87.255.67:8850');
  });

  it('omits the failure footer when nothing failed', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'http://x',
      opportunities: [], byStream: {}, deadlines: [], failedSources: [],
    });
    expect(html).not.toContain('Sources that failed');
  });
});
