import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanListingTitle, withCleanTitles } from '../lib/display-title.ts';

describe('display title cleanup for rows ingested before the worker fix', () => {
  it('recovers the heading from stored card markup', () => {
    assert.equal(
      cleanListingTitle('PRF News\\ \\ \\ \\ August 27, 2026\\ \\ August 27, 2026\\ \\ ##### PRF seeking experienced consultant'),
      'PRF seeking experienced consultant',
    );
    assert.equal(
      cleanListingTitle('Legal development\\ \\ \\ \\ ### A free for all? Consultation opens\\ September 11, 2026\\ Discover more'),
      'A free for all? Consultation opens',
    );
  });
  it('leaves clean titles and other fields untouched', () => {
    const rows = [{ id: 1, title: 'High Court refuses special leave', url: 'https://example.org' }];
    assert.deepEqual(withCleanTitles(rows), rows);
    assert.equal(cleanListingTitle('C# for lawyers'), 'C# for lawyers');
  });
});
