import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('Theme keyboard controls', () => {
  it('uses one tab stop and arrow keys to select a theme', () => {
    render(<ThemeToggle />);
    const system = screen.getByRole('radio', { name: 'System' });
    const dark = screen.getByRole('radio', { name: 'Dark' });
    expect(dark).toHaveAttribute('tabindex', '-1');
    system.focus();
    fireEvent.keyDown(system, { key: 'ArrowRight' });
    expect(dark).toHaveFocus();
    expect(dark).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(dark, { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    fireEvent.click(system);
  });

  it('keeps two toggles on one page in step under distinct names', () => {
    render(
      <>
        <ThemeToggle label="Colour theme, header" size="compact" />
        <ThemeToggle />
      </>,
    );
    const header = screen.getByRole('radiogroup', { name: 'Colour theme, header' });
    const footer = screen.getByRole('radiogroup', { name: 'Colour theme' });
    fireEvent.click(within(header).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(within(footer).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(footer).getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(within(header).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  });
});
