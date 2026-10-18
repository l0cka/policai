import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverageMap } from './coverage-map';
import {
  buildCoverageData,
  parseCoverageViewState,
  type CoverageCategory,
  type CoverageSource,
} from '@/lib/coverage-data';
import type { Jurisdiction } from '@/types';
import type { ThemeId } from '@/lib/themes';

const VOCABULARY: CoverageCategory[] = [
  { key: 'courts-tribunals', label: 'Courts and tribunals' },
  { key: 'generative-ai', label: 'Generative AI' },
  { key: 'self-represented-litigants', label: 'Self-represented litigants' },
];

function source(id: string, jurisdiction: Jurisdiction, themes: ThemeId[]): CoverageSource {
  return { id, title: `${id} — full title`, jurisdiction, type: 'practice_note', status: 'active', themes };
}

const SOURCES = [
  source('nsw-a', 'nsw', ['courts-tribunals', 'generative-ai']),
  source('nsw-b', 'nsw', ['courts-tribunals']),
  source('vic-a', 'vic', ['courts-tribunals', 'self-represented-litigants']),
  source('fed-a', 'federal', ['generative-ai']),
];

function renderMap(query = '', sources = SOURCES, vocabulary = VOCABULARY) {
  window.history.replaceState({}, '', `/coverage${query ? `?${query}` : ''}`);
  const data = buildCoverageData(sources, vocabulary);
  render(<CoverageMap data={data} initialState={parseCoverageViewState(new URLSearchParams(query), data)} />);
  return data;
}

function cell(name: RegExp) {
  return screen.getByRole('button', { name });
}

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => window.history.replaceState({}, '', '/'));

describe('CoverageMap', () => {
  it('renders a table with a row per theme, nine jurisdiction columns and row totals', () => {
    renderMap();
    const table = screen.getByRole('table');
    const columnHeads = within(table).getAllByRole('columnheader');
    expect(columnHeads.map((head) => head.textContent)).toEqual(['Theme', 'Fed', 'NSW', 'Vic', 'Qld', 'SA', 'WA', 'Tas', 'ACT', 'NT', 'Total']);
    const rowHeads = within(table).getAllByRole('rowheader');
    expect(rowHeads.map((head) => head.textContent)).toEqual(['Courts and tribunals', 'Generative AI', 'Self-represented litigants']);
    expect(cell(/^Courts and tribunals, New South Wales: 2 records$/)).toHaveTextContent('2');
    expect(within(table).getAllByText('no records')).toHaveLength(27 - 5);
  });

  it('gives the grid one tab stop and moves focus with the arrow keys, Home and End', () => {
    renderMap();
    const tabbable = screen.getByRole('table').querySelectorAll('button[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    const nswCourts = cell(/^Courts and tribunals, New South Wales/);
    expect(tabbable[0]).toBe(nswCourts);

    nswCourts.focus();
    fireEvent.keyDown(nswCourts, { key: 'ArrowRight' });
    expect(cell(/^Courts and tribunals, Victoria/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(cell(/^Self-represented litigants, Victoria/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Self-represented litigants' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(cell(/^Self-represented litigants, Victoria/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'Vic' })).toHaveFocus();
    expect(screen.getByRole('table').querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
  });

  it('opens the drill-down under a cell, writes the URL and closes on Escape with focus returned', () => {
    renderMap();
    const nswCourts = cell(/^Courts and tribunals, New South Wales/);
    act(() => nswCourts.click());

    const region = screen.getByRole('region', { name: /Courts and tribunals · New South Wales/ });
    expect(within(region).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/policies/nsw-a', '/policies/nsw-b']);
    expect(nswCourts).toHaveAttribute('aria-expanded', 'true');
    expect(nswCourts).toHaveAttribute('aria-controls', region.id);
    expect(window.location.search).toBe('?theme=courts-tribunals&j=nsw');
    expect(screen.getByText(/2 records, listed below/)).toBeInTheDocument();

    within(region).getAllByRole('link')[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(nswCourts).toHaveFocus();
    expect(window.location.search).toBe('');
  });

  it('closes from Clear selection and from a second activation', () => {
    renderMap('theme=courts-tribunals&j=nsw');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const nswCourts = cell(/^Courts and tribunals, New South Wales/);
    act(() => screen.getByRole('button', { name: 'Clear selection' }).click());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(nswCourts).toHaveFocus();
    act(() => nswCourts.click());
    act(() => nswCourts.click());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('scrolls a shared link to the drill-down row clear of the site header and the column strip (#329)', () => {
    const header = document.createElement('header');
    header.setAttribute('data-site-header', '');
    document.body.prepend(header);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const heights = new Map([['HEADER', 94], ['THEAD', 45]]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: heights.get(this.tagName) ?? 0 } as DOMRect;
    });
    const offsets: Record<string, string>[] = [];
    scrollIntoView.mockImplementation(function (this: HTMLElement) {
      const map = this.closest<HTMLElement>('.coverage-map')!;
      offsets.push({
        target: this.className,
        header: map.style.getPropertyValue('--coverage-sticky-top'),
        strip: map.style.getPropertyValue('--coverage-strip-height'),
      });
    });
    try {
      renderMap('theme=courts-tribunals&j=nsw');
    } finally {
      header.remove();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
    expect(offsets).toEqual([{ target: 'coverage-drill-row', header: '94px', strip: '45px' }]);
  });

  it('re-measures the offsets when the site header or the column strip resizes', () => {
    const header = document.createElement('header');
    header.setAttribute('data-site-header', '');
    document.body.prepend(header);
    const heights = new Map([['HEADER', 94], ['THEAD', 45]]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: heights.get(this.tagName) ?? 0 } as DOMRect;
    });
    const observed: { element: Element; options?: ResizeObserverOptions }[] = [];
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = () => callback([], this as unknown as ResizeObserver);
        }
        observe(element: Element, options?: ResizeObserverOptions) {
          observed.push({ element, options });
        }
        disconnect = disconnect;
      },
    );
    try {
      renderMap();
      const map = document.querySelector<HTMLElement>('.coverage-map')!;
      expect(observed.map((entry) => entry.element)).toEqual([header, map.querySelector('thead')]);
      expect(observed.every((entry) => entry.options?.box === 'border-box')).toBe(true);

      heights.set('HEADER', 120);
      heights.set('THEAD', 60);
      act(resize);
      expect(map.style.getPropertyValue('--coverage-sticky-top')).toBe('120px');
      expect(map.style.getPropertyValue('--coverage-strip-height')).toBe('60px');

      cleanup();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      header.remove();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('groups a theme row by jurisdiction and a column by theme', () => {
    renderMap();
    act(() => screen.getByRole('button', { name: 'Courts and tribunals' }).click());
    let region = screen.getByRole('region', { name: /Courts and tribunals · All jurisdictions 3 records/ });
    expect(within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['New South Wales', 'Victoria']);
    expect(window.location.search).toBe('?theme=courts-tribunals');

    act(() => screen.getByRole('button', { name: 'NSW' }).click());
    region = screen.getByRole('region', { name: /New South Wales · All themes 2 records/ });
    expect(within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Courts and tribunals', 'Generative AI']);
    expect(window.location.search).toBe('?j=nsw');
  });

  it('replaces history to open and close a selection and pushes a move to a new one (#330)', () => {
    renderMap();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const urls = (spy: typeof push) => spy.mock.calls.map((call) => call[2]);

    act(() => cell(/^Courts and tribunals, New South Wales/).click());
    expect(urls(replace)).toEqual(['/coverage?theme=courts-tribunals&j=nsw']);
    expect(push).not.toHaveBeenCalled();

    act(() => cell(/^Generative AI, Federal/).click());
    expect(urls(push)).toEqual(['/coverage?theme=generative-ai&j=federal']);

    act(() => screen.getByRole('button', { name: 'Clear selection' }).click());
    expect(urls(replace)).toEqual(['/coverage?theme=courts-tribunals&j=nsw', '/coverage']);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('restores the selection from the URL on Back', () => {
    renderMap();
    act(() => cell(/^Courts and tribunals, New South Wales/).click());
    act(() => cell(/^Generative AI, Federal/).click());
    expect(window.location.search).toBe('?theme=generative-ai&j=federal');
    act(() => {
      window.history.replaceState({}, '', '/coverage?theme=courts-tribunals&j=nsw');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('region', { name: /Courts and tribunals · New South Wales/ })).toBeInTheDocument();
  });

  it('switches to the instrument-type axis', () => {
    renderMap();
    act(() => screen.getByRole('button', { name: 'By instrument type' }).click());
    expect(screen.getByRole('button', { name: 'By instrument type' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('rowheader').map((head) => head.textContent)).toEqual(['Practice Note']);
    expect(window.location.search).toBe('?by=type');
  });

  it('shows the empty sentence and the theme counts when no theme is charted', () => {
    renderMap('', [], VOCABULARY);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/^No theme has/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Courts and tribunals: 0 records',
      'Generative AI: 0 records',
      'Self-represented litigants: 0 records',
    ]);
  });
});
