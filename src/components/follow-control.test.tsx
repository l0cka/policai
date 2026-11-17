import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FOLLOWS_STORAGE_KEY, type Follow } from '@/lib/follows';
import { FollowingFeeds, FollowingList, type FollowingPolicy } from './follow-control';

const POLICIES: FollowingPolicy[] = [
  { id: 'vic-record', title: 'Victorian guidance', jurisdiction: 'vic', themes: ['privacy-data'], type: 'guideline' },
];

function renderWithFollows(follows: Follow[]) {
  localStorage.setItem(FOLLOWS_STORAGE_KEY, JSON.stringify(follows));
  render(
    <>
      <FollowingFeeds />
      <FollowingList policies={POLICIES} />
    </>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe('FollowingFeeds', () => {
  it('links an Atom and a JSON feed for each followed jurisdiction and theme', () => {
    renderWithFollows([
      { kind: 'policy', id: 'vic-record' },
      { kind: 'jurisdiction', id: 'vic' },
      { kind: 'theme', id: 'privacy-data' },
    ]);

    const section = screen.getByRole('region', { name: 'Feeds for what you follow' });
    expect(
      within(section)
        .getAllByRole('link')
        .map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')]),
    ).toEqual([
      ['Victoria developments, Atom feed', '/feeds/jurisdiction/vic/feed.xml'],
      ['Victoria developments, JSON feed', '/feeds/jurisdiction/vic/feed.json'],
      ['Privacy and data records, Atom feed', '/feeds/theme/privacy-data/feed.xml'],
      ['Privacy and data records, JSON feed', '/feeds/theme/privacy-data/feed.json'],
    ]);
  });

  it('still offers the feed when a followed jurisdiction has no public record yet', () => {
    renderWithFollows([{ kind: 'jurisdiction', id: 'nt' }]);

    expect(screen.getByRole('status')).toHaveTextContent('No public records match');
    expect(screen.getByRole('link', { name: 'Northern Territory developments, Atom feed' })).toHaveAttribute(
      'href',
      '/feeds/jurisdiction/nt/feed.xml',
    );
  });

  it('offers no feed section when only single records are followed', () => {
    renderWithFollows([{ kind: 'policy', id: 'vic-record' }]);

    expect(screen.getByRole('link', { name: 'Victorian guidance' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Feeds for what you follow' })).toBeNull();
  });
});
