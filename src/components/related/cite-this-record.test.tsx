import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CiteThisRecord } from './cite-this-record';

const citation = 'Privacy and Other Legislation Amendment Act 2024 (Cth)';
const permalink =
  'Privacy and Other Legislation Amendment Act 2024 <https://policai.org/policies/sample> (as recorded by Policai, verified 7 November 2026)';

describe('CiteThisRecord', () => {
  it('renders both lines and the check-the-source label as server HTML', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<CiteThisRecord citation={citation} permalink={permalink} />);
    expect(container.querySelector('h2')?.textContent).toBe('Cite this record');
    expect(container.textContent).toContain('Suggested citation. Check it against the source.');
    expect(container.querySelector('#cite-source')?.textContent).toBe(citation);
    expect(container.querySelector('#cite-policai')?.textContent).toBe(permalink);
  });

  it('copies each line with its own button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CiteThisRecord citation={citation} permalink={permalink} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy the suggested citation' }));
    expect(writeText).toHaveBeenLastCalledWith(citation);
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy the Policai record link' }));
    expect(writeText).toHaveBeenLastCalledWith(permalink);
    vi.unstubAllGlobals();
  });
});
