import { fireEvent, render, screen } from '@testing-library/react';
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
});
