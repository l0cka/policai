import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageMetadata, siteJsonLd } from '../lib/site-meta.ts';

describe('per-page share metadata', () => {
  it('gives a page its own share title, url and card', () => {
    const meta = pageMetadata({ title: 'Deadlines', description: 'Closing dates.', path: '/deadlines' });
    assert.equal(meta.title, 'Deadlines');
    assert.equal(meta.openGraph.title, 'Deadlines - Policai A2J');
    assert.equal(meta.openGraph.url, 'https://a2j.policai.org/deadlines');
    assert.equal(meta.openGraph.images[0].url, 'https://a2j.policai.org/opengraph-image');
    assert.equal(meta.twitter.card, 'summary_large_image');
  });

  it('leaves the home title to the layout default', () => {
    const meta = pageMetadata({ description: 'Home.', path: '/' });
    assert.equal('title' in meta, false);
    assert.equal(meta.openGraph.url, 'https://a2j.policai.org');
  });

  it('emits JSON-LD that cannot close its script tag', () => {
    const graph = JSON.parse(siteJsonLd())['@graph'];
    assert.deepEqual(graph.map((node) => node['@type']), ['WebSite', 'Organization']);
    assert.equal(siteJsonLd().includes('<'), false);
  });
});
