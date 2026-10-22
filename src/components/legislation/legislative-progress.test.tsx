import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Legislative } from '@/lib/legislation/model';
import { LegislativeProgress } from './legislative-progress';

const legislative: Legislative = {
  kind: 'instrument',
  ref: { register: 'frl', titleId: 'F2026L01223' },
  issuerBodyId: 'asic',
  enablingAct: 'Corporations Act 2001, s 798G(1)',
  events: [
    {
      date: '2026-09-17',
      precision: 'day',
      event: { kind: 'registered' },
      source: { url: 'https://www.legislation.gov.au/F2026L01223/asmade/details' },
    },
  ],
};

describe('LegislativeProgress', () => {
  it('lists each recorded stage with its date and source, then the stage still ahead', () => {
    render(
      <LegislativeProgress
        policy={{ jurisdiction: 'federal', legislative, dates: [{ type: 'commenced', date: '2028-03-18', precision: 'day' }] }}
      />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Registered on the Federal Register of Legislation, done');
    expect(items[0]).toHaveTextContent('17 September 2026');
    expect(within(items[0]).getByRole('link', { name: 'Source' })).toHaveAttribute(
      'href',
      'https://www.legislation.gov.au/F2026L01223/asmade/details',
    );
    expect(items[1]).toHaveTextContent('Commencement, scheduled for 18 March 2028, not yet');
  });

  it('server-renders without client script', () => {
    const html = renderToStaticMarkup(<LegislativeProgress policy={{ jurisdiction: 'federal', legislative, dates: [] }} />);
    expect(html).toContain('<h2 id="legislative-progress"');
    expect(html).toContain('dateTime="2026-09-17"');
  });
});
