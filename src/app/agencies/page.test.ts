import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: vi.fn(),
}));

import AgenciesRedirectPage from './page';

describe('/agencies', () => {
  it('redirects to the APS AI tracker', () => {
    AgenciesRedirectPage();
    expect(redirect).toHaveBeenCalledWith('https://apsaitracker.app/');
  });
});
