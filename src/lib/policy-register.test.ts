import { describe, expect, it } from 'vitest';
import { parseRegisterState, registerParams, selectRegisterPolicies, updateRegisterState } from './policy-register';
import { buildPolicy } from '@/test/factories';

describe('register state', () => {
  it('round-trips a shareable research view, including literal all search', () => {
    const state = parseRegisterState(new URLSearchParams('q=all&jurisdiction=nsw,federal&type=policy&status=active&sort=title:asc&view=table&page=3'));
    expect(state).toMatchObject({ search: 'all', jurisdictions: ['nsw', 'federal'], types: ['policy'], statuses: ['active'], sortField: 'title', sortDirection: 'asc', viewMode: 'table', page: 3 });
    expect(parseRegisterState(registerParams(state))).toEqual(state);
  });
  it('validates URL fields, deduplicates filters and ignores invalid page numbers', () => {
    const state = parseRegisterState(new URLSearchParams('jurisdiction=nsw,nope,nsw&type=bad&status=trashed&sort=oops:desc&view=oops&page=Infinity'));
    expect(state).toMatchObject({ jurisdictions: ['nsw'], types: [], statuses: [], sortField: 'effectiveDate', sortDirection: 'desc', viewMode: 'list', page: 1 });
    for (const page of ['-1', '0', '1.5', '2x', '999999999999999999']) expect(parseRegisterState(new URLSearchParams({ page })).page).toBe(1);
  });
  it('resets pagination for changed research criteria but preserves it for a view switch', () => {
    const state = parseRegisterState(new URLSearchParams('page=3'));
    expect(updateRegisterState(state, { search: 'assurance' }).page).toBe(1);
    expect(updateRegisterState(state, { jurisdictions: ['nsw'] }).page).toBe(1);
    expect(updateRegisterState(state, { sortDirection: 'asc' }).page).toBe(1);
    expect(updateRegisterState(state, { viewMode: 'table' }).page).toBe(3);
  });
  it('filters and sorts without changing the source array, using visible jurisdiction names', () => {
    const policies = [buildPolicy({ id: 'federal', jurisdiction: 'federal' }), buildPolicy({ id: 'act', jurisdiction: 'act' })];
    const state = parseRegisterState(new URLSearchParams('sort=jurisdiction:asc'));
    expect(selectRegisterPolicies(policies, state).map(p => p.id)).toEqual(['act', 'federal']);
    expect(policies.map(p => p.id)).toEqual(['federal', 'act']);
    expect(selectRegisterPolicies(policies, { ...state, jurisdictions: ['nsw'] })).toEqual([]);
  });
  it('filters legislative records by the stage their events derive, and round-trips it', () => {
    const source = { url: 'https://www.aph.gov.au/bill' };
    const bill = buildPolicy({
      id: 'bill',
      type: 'legislation',
      legislative: {
        kind: 'bill',
        ref: { register: 'aph', billId: 's1471' },
        origin: 'private_member',
        events: [{ date: '2025-11-24', precision: 'day', event: { kind: 'introduced', chamber: 'upper' }, source }],
      },
    });
    const state = parseRegisterState(new URLSearchParams('stage=before_parliament,passed'));
    expect(state.stages).toEqual(['before_parliament']);
    expect(parseRegisterState(registerParams(state))).toEqual(state);
    expect(selectRegisterPolicies([bill, buildPolicy({ id: 'guideline' })], state).map(p => p.id)).toEqual(['bill']);
    expect(selectRegisterPolicies([bill], { ...state, stages: ['in_force'] })).toEqual([]);
  });
});
