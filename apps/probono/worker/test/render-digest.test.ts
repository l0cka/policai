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

  it('escapes HTML entities in titles, URLs, and other content', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'http://x',
      opportunities: [{ id: 1, title: 'A <b>"bold"</b> & \'risky\' move', url: 'https://example.org/x?a=1&b="onmouseover="alert(1)', blurb: null, source_name: 'Test "source"' }],
      byStream: {}, deadlines: [], failedSources: [],
    });
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&quot;bold&quot;');
    expect(html).toContain('&#39;risky&#39;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('onmouseover="');
    expect(html).toContain('&quot;onmouseover=');
  });

  it('places failed sources footer before dashboard link', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'http://dashboard.local',
      opportunities: [], byStream: {}, deadlines: [], failedSources: ['Bad Source'],
    });
    const failedPos = html.indexOf('Sources that failed');
    const dashboardPos = html.indexOf('Open the dashboard');
    expect(failedPos).toBeGreaterThan(-1);
    expect(dashboardPos).toBeGreaterThan(-1);
    expect(failedPos).toBeLessThan(dashboardPos);
  });

  it('renders an item with a javascript: URL with no href, title as plain text', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'http://x',
      opportunities: [{ id: 1, title: 'Malicious item', url: 'javascript:alert(1)', blurb: null, source_name: 'Test' }],
      byStream: {}, deadlines: [], failedSources: [],
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a href="javascript');
    expect(html).toContain('Malicious item');
  });

  it('renders no href for a javascript: dashboardUrl', () => {
    const html = renderDigest({
      periodStart: new Date(), periodEnd: new Date(), dashboardUrl: 'javascript:alert(1)',
      opportunities: [], byStream: {}, deadlines: [], failedSources: [],
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a href="javascript');
  });
});
