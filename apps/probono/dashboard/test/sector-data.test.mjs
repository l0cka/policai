import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markMonitored } from '../lib/sector-data.ts';

const org = (name, url) => ({ name, url });

describe('markMonitored host matching', () => {
  it('does not treat a shared state-government host as a parent site', () => {
    const [legalAid, portal, nsw] = markMonitored(
      [
        org('Legal Aid WA', 'https://www.legalaid.wa.gov.au/'),
        org('WA department', 'https://www.wa.gov.au/organisation/department-of-justice'),
        org('NSW department', 'https://www.nsw.gov.au/departments-and-agencies/justice'),
      ],
      [{ name: 'Legal Aid WA feed', url: 'https://legalaid.wa.gov.au/news.rss' }],
    );
    assert.equal(legalAid.monitored, true);
    assert.equal(portal.monitored, false);
    assert.equal(nsw.monitored, false);
  });

  it('still lets a subdomain source belong to its organisation domain', () => {
    const [ag] = markMonitored(
      [org('Attorney-General', 'https://www.ag.gov.au/')],
      [{ name: 'Consultations', url: 'https://consultations.ag.gov.au/rss' }],
    );
    assert.equal(ag.monitored, true);
  });
});
