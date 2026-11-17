import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/filter-bar';

function renderBar({ active = false, onClear = () => {} } = {}) {
  const onSearch = vi.fn();
  const onSelect = vi.fn();
  render(
    <FilterBar label="Find things" shown={3} total={12} noun="things" active={active} onClear={onClear}>
      <FilterSearch label="Search things" placeholder="Search" value="" onChange={onSearch} />
      <FilterSelect label="Filter by colour" value="all" onChange={onSelect}>
        <option value="all">All colours</option>
        <option value="red">Red</option>
      </FilterSelect>
    </FilterBar>,
  );
  return { onSearch, onSelect };
}

it('names the region, the search box and each select', () => {
  renderBar();
  const region = screen.getByRole('region', { name: 'Find things' });
  expect(within(region).getByRole('searchbox', { name: 'Search things' })).toBeInTheDocument();
  expect(within(region).getByRole('combobox', { name: 'Filter by colour' })).toHaveValue('all');
});

it('reports the typed search text and the chosen option', () => {
  const { onSearch, onSelect } = renderBar();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ink' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'red' } });
  expect(onSearch).toHaveBeenCalledWith('ink');
  expect(onSelect).toHaveBeenCalledWith('red');
});

it('announces the count as "N of M things" in a polite live region', () => {
  renderBar();
  expect(screen.getByText('3 of 12 things')).toHaveAttribute('aria-live', 'polite');
});

it('offers Clear filters only while a filter is active', () => {
  renderBar();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
});

it('clears every filter from one control', () => {
  const onClear = vi.fn();
  renderBar({ active: true, onClear });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(onClear).toHaveBeenCalledTimes(1);
});
