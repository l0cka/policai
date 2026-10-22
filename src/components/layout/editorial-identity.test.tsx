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
    ['/this-week', 'Updates'],
    ['/developments', 'Updates'],
    ['/legislation', 'Legislation'],
    ['/courts', 'Courts'],
    ['/analysis/some-piece', 'Analysis'],
    ['/methodology', 'About'],
    ['/status', 'About'],
    ['/status/refusals', 'About'],
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
