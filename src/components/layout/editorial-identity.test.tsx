import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PolicaiLogo } from './PolicaiLogo';
import { Header } from './Header';
const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderHeader(path = '/') {
  pathname.current = path;
  return render(
    <Header
      collectedAt="2026-09-21T02:00:00Z"
      collectionHealth="healthy"
      successfulSourceCount={10}
      dueSourceCount={10}
      renderedAt="2026-09-21T03:00:00Z"
    />,
  );
}

describe('Editorial identity and navigation', () => {
  it('links collection freshness to Source status, separately from record verification', () => {
    renderHeader();
    const status = screen.getByRole('link', { name: /^Source status:/ });
    expect(status).toHaveAttribute('href', '/status');
    expect(status.getAttribute('aria-label')).toMatch(/collected 21 sept? 2026/);
    expect(screen.queryByText(/DATA CURRENT TO/)).not.toBeInTheDocument();
  });

  it('uses the companion vector mark and lowercase wordmark', () => {
    const { container } = render(<PolicaiLogo />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 64 76');
    expect(screen.getByText('policai')).toBeInTheDocument();
  });

  it('shows the five sections and no dropdown', () => {
    renderHeader();
    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(primary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Register',
      'Updates',
      'Legislation',
      'Courts',
      'Analysis',
    ]);
    expect(screen.queryByRole('button', { name: 'Explore' })).not.toBeInTheDocument();
  });

  it.each([
    ['/', 'Register'],
    ['/policies/some-record', 'Register'],
    ['/timeline', 'Register'],
    ['/coverage', 'Register'],
    ['/following', 'Register'],
    ['/this-week', 'Updates'],
    ['/developments', 'Updates'],
    ['/legislation', 'Legislation'],
    ['/courts', 'Courts'],
    ['/analysis/some-piece', 'Analysis'],
    ['/methodology', 'About'],
    ['/status', 'About'],
    ['/status/refusals', 'About'],
    ['/status/reuse', 'About'],
  ])('marks the section for %s as %s', (path, section) => {
    renderHeader(path);
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(current).toEqual([section]);
  });

  it('lists every section in the mobile menu and returns focus on Escape', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    for (const [name, href] of [
      ['Register', '/'],
      ['Updates', '/this-week'],
      ['Legislation', '/legislation'],
      ['Courts', '/courts'],
      ['Analysis', '/analysis'],
      ['About', '/methodology'],
      ['A2J', 'https://a2j.policai.org'],
    ]) {
      expect(within(mobile).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(mobile).getByRole('link', { name: /^Source status:/ })).toHaveAttribute('href', '/status');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
  });

  it('lists each section\'s other views under it in the mobile menu', () => {
    renderHeader('/timeline');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(within(mobile).getAllByRole('link').map((link) => link.getAttribute('href')).slice(0, 14)).toEqual([
      '/',
      '/timeline',
      '/coverage',
      '/rule-finder',
      '/following',
      '/this-week',
      '/developments',
      '/legislation',
      '/courts',
      '/analysis',
      '/methodology',
      '/status',
      '/status/refusals',
      '/status/reuse',
    ]);
    expect(
      within(mobile)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent),
    ).toEqual(['Timeline']);
  });

  it('marks the section itself in the mobile menu on a page that is not one of its views', () => {
    renderHeader('/policies/some-record');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(
      within(mobile)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent),
    ).toEqual(['Register']);
  });

  it('offers the colour theme in the header and in the open mobile menu, each under its own name', () => {
    renderHeader();
    expect(screen.getByRole('radiogroup', { name: 'Colour theme, header' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Colour theme, menu' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('radiogroup', { name: 'Colour theme, menu' });
    fireEvent.click(within(menu).getByRole('radio', { name: 'Dark' }));
    expect(
      within(screen.getByRole('radiogroup', { name: 'Colour theme, header' })).getByRole('radio', { name: 'Dark' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('radio', { name: 'System' }));
  });

  it('points the menu button at the menu only while the menu exists', () => {
    renderHeader();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).not.toHaveAttribute('aria-controls');
    fireEvent.click(toggle);
    const controlled = screen.getByRole('button', { name: 'Close menu' }).getAttribute('aria-controls');
    expect(document.getElementById(controlled ?? '')).toContainElement(
      screen.getByRole('navigation', { name: 'Mobile' }),
    );
  });

  it('gives the status and A2J links in the header bar a 44px target at every width', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /^Source status:/ })).toHaveClass('min-h-11');
    expect(screen.getByRole('link', { name: 'A2J' })).toHaveClass('min-h-11');
  });

  it('keeps the mobile menu open when focus returns to its toggle', () => {
    renderHeader();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(toggle);
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    const register = within(mobile).getByRole('link', { name: 'Register' });
    fireEvent.blur(register, { relatedTarget: toggle });
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument();
    fireEvent.blur(register, { relatedTarget: document.body });
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });
});
