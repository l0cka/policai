import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Footer } from './Footer';

it('lists every page under its section, with the utilities moved out of the header', () => {
  render(<Footer />);
  const footer = screen.getByRole('navigation', { name: 'Footer' });
  for (const [name, href] of [
    ['Records', '/'],
    ['Timeline', '/timeline'],
    ['Coverage map', '/coverage'],
    ['This week', '/this-week'],
    ['Developments', '/developments'],
    ['RSS', '/feed.xml'],
    ['Legislation', '/legislation'],
    ['Courts', '/courts'],
    ['Analysis', '/analysis'],
    ['Methodology', '/methodology'],
    ['Source status', '/status'],
    ['API', '/api/policies'],
    ['Feedback', 'https://github.com/l0cka/policai/issues'],
  ]) {
    expect(within(footer).getByRole('link', { name })).toHaveAttribute('href', href);
  }
  expect(screen.getByRole('radiogroup', { name: 'Colour theme' })).toBeInTheDocument();
});
