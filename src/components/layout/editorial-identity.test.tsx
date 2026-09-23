import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PolicaiLogo } from './PolicaiLogo';
import { Header } from './Header';
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Editorial identity and navigation', () => {
  it('labels collection freshness separately from record verification', () => {
    render(<Header dataCurrentAt="2026-09-21T02:00:00Z" collectionHealth="healthy" successfulSourceCount={10} dueSourceCount={10} />);
    expect(screen.getAllByText(/COLLECTION AS AT/)).toHaveLength(2);
    expect(screen.queryByText(/DATA CURRENT TO/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source health' })).toHaveAttribute('href', '/status');
  });
  it('uses the companion vector mark and lowercase wordmark', () => {
    const { container } = render(<PolicaiLogo />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '0 0 64 76',
    );
    expect(screen.getByText('policai')).toBeInTheDocument();
  });
  it('keeps every navigation destination and exposes utilities in the mobile menu', () => {
    render(
      <Header
        dataCurrentAt={null}
        collectionHealth="healthy"
        successfulSourceCount={10}
        dueSourceCount={10}
      />,
    );
    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(primary).getByRole('link', { name: 'Register' }),
    ).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    for (const [name, href] of [
      ['Register', '/'],
      ['Developments', '/developments'],
      ['Courts', '/courts'],
      ['Timeline', '/timeline'],
      ['Network', '/network'],
      ['Methodology', '/methodology'],
      ['API', '/api/policies'],
      ['Feedback', 'https://github.com/l0cka/policai/issues'],
      ['A2J', 'https://a2j.policai.org'],
    ]) {
      expect(within(mobile).getByRole('link', { name })).toHaveAttribute(
        'href',
        href,
      );
    }
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('navigation', { name: 'Mobile' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
  });
  it('closes the Explore menu when keyboard focus leaves it', () => {
    render(
      <Header
        dataCurrentAt={null}
        collectionHealth="healthy"
        successfulSourceCount={10}
        dueSourceCount={10}
      />,
    );
    const explore = screen.getByRole('button', { name: 'Explore' });
    fireEvent.click(explore);
    expect(explore).toHaveAttribute('aria-expanded', 'true');
    const timeline = screen.getByRole('link', { name: 'Timeline' });
    fireEvent.blur(explore, { relatedTarget: timeline });
    expect(explore).toHaveAttribute('aria-expanded', 'true');
    const a2j = within(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).getByRole('link', { name: 'A2J' });
    fireEvent.blur(timeline, { relatedTarget: a2j });
    expect(explore).toHaveAttribute('aria-expanded', 'false');
  });
  it('keeps the mobile menu open when focus returns to its toggle', () => {
    render(
      <Header
        dataCurrentAt={null}
        collectionHealth="healthy"
        successfulSourceCount={10}
        dueSourceCount={10}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(toggle);
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    const register = within(mobile).getByRole('link', { name: 'Register' });
    fireEvent.blur(register, { relatedTarget: toggle });
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument();
    fireEvent.blur(register, { relatedTarget: document.body });
    expect(
      screen.queryByRole('navigation', { name: 'Mobile' }),
    ).not.toBeInTheDocument();
  });
});
