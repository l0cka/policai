import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionNav } from './SectionNav';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderAt(path: string) {
  pathname.current = path;
  return render(<SectionNav />);
}

describe('SectionNav', () => {
  it.each([
    ['/', 'Register views', ['Records', 'Timeline', 'Coverage map', 'Rule finder'], 'Records'],
    ['/timeline', 'Register views', ['Records', 'Timeline', 'Coverage map', 'Rule finder'], 'Timeline'],
    ['/coverage', 'Register views', ['Records', 'Timeline', 'Coverage map', 'Rule finder'], 'Coverage map'],
    ['/rule-finder', 'Register views', ['Records', 'Timeline', 'Coverage map', 'Rule finder'], 'Rule finder'],
    ['/this-week', 'Updates views', ['This week', 'Developments'], 'This week'],
    ['/developments', 'Updates views', ['This week', 'Developments'], 'Developments'],
    ['/methodology', 'About views', ['Methodology', 'Source status', 'Refusing sites', 'Reuse terms'], 'Methodology'],
    ['/status', 'About views', ['Methodology', 'Source status', 'Refusing sites', 'Reuse terms'], 'Source status'],
    ['/status/refusals', 'About views', ['Methodology', 'Source status', 'Refusing sites', 'Reuse terms'], 'Refusing sites'],
    ['/status/reuse', 'About views', ['Methodology', 'Source status', 'Refusing sites', 'Reuse terms'], 'Reuse terms'],
  ])('on %s lists the %s and marks the current one', (path, label, views, current) => {
    renderAt(path);
    const nav = screen.getByRole('navigation', { name: label });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(views);
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual([
      current,
    ]);
  });

  it.each(['/policies/some-record', '/legislation', '/courts', '/analysis', '/analysis/some-piece', '/following'])(
    'renders nothing on %s',
    (path) => {
      const { container } = renderAt(path);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
