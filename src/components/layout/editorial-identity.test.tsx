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
});
