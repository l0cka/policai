import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Footer } from './Footer';

it('links Coverage and Timeline', () => {
  render(<Footer />);
  expect(screen.getByRole('link', { name: 'Coverage' })).toHaveAttribute(
    'href',
    '/coverage',
  );
  expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute(
    'href',
    '/timeline',
  );
});
