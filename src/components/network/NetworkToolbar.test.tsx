import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetworkToolbar } from './NetworkToolbar';
import { THEMES } from '@/lib/themes';

const themes = THEMES.map(({ key, label }) => ({ key, label, policyCount: 3 }));
const themeOptions = THEMES.map(({ label }) => `${label} (3)`);

function renderToolbar(selectedTheme: string | null = null) {
  render(
    <NetworkToolbar
      searchQuery=""
      onSearchChange={vi.fn()}
      themes={themes}
      selectedTheme={selectedTheme}
      onThemeChange={vi.fn()}
      jurisdictions={[]}
      activeJurisdictions={new Set()}
      onToggleJurisdiction={vi.fn()}
      relationFilter="all"
      onRelationFilterChange={vi.fn()}
      viewMode="focus"
      onViewModeChange={vi.fn()}
      visiblePolicies={83}
      totalPolicies={83}
      onReset={vi.fn()}
      onCopyLink={vi.fn()}
      copied={false}
    />,
  );
}

function optionLabels(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('NetworkToolbar theme filter', () => {
  it('lists every theme in the desktop select', () => {
    renderToolbar();
    const select = screen.getByRole('combobox', { name: 'Theme' });
    expect(optionLabels(select)).toEqual(['All themes', ...themeOptions]);
  });

  it('lists every theme in the phone filter sheet', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Network filters' });
    const select = within(sheet).getByRole('combobox', { name: 'Theme' });
    expect(optionLabels(select)).toEqual(['All themes', ...themeOptions]);
  });

  it('shows the last theme as selected in the desktop select', () => {
    renderToolbar('online-safety');
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue(
      'online-safety',
    );
  });
});
