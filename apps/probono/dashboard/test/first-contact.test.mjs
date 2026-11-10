import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  findFirstContact,
  parseQuery,
  validateServices,
  NOTICE,
  MAX_RESULTS,
  TOOL_DEFINITION,
} from '../lib/first-contact.ts';

const prov = (url = 'https://example.org/page', checked = '2026-11-01') => ({ url, checked });

function svc(overrides) {
  const base = {
    id: 'svc',
    name: 'Service',
    kind: 'clc',
    level: 'state',
    states: ['NSW'],
    catchment: { statewide: true },
    problems: ['general'],
    intake: { phone: '1300 000 000', url: 'https://example.org/contact' },
    provenance: {
      catchment: prov(),
      problems: prov(),
      'intake.phone': prov(),
      'intake.url': prov(),
    },
    review: 'reviewed',
  };
  return { ...base, ...overrides };
}

const commission = svc({
  id: 'nsw-lac',
  name: 'Legal Aid NSW',
  kind: 'legal_aid_commission',
});
const local = svc({
  id: 'inner-clc',
  name: 'Inner CLC',
  kind: 'clc',
  level: 'local',
  catchment: { postcodes: ['2000-2010'] },
  problems: ['tenancy'],
});
const wide = svc({
  id: 'wide-clc',
  name: 'Wide CLC',
  kind: 'clc',
  level: 'local',
  catchment: { postcodes: ['2000-2999'] },
  problems: ['tenancy'],
});
const atsils = svc({
  id: 'nsw-atsils',
  name: 'ATSILS',
  kind: 'atsils',
  level: 'state',
  cultural: ['aboriginal_torres_strait_islander'],
  problems: ['criminal', 'family_law'],
  provenance: {
    catchment: prov(),
    problems: prov(),
    cultural: prov(),
    'intake.phone': prov(),
    'intake.url': prov(),
  },
});
const national = svc({
  id: 'national-line',
  name: 'National Line',
  kind: 'national',
  level: 'national',
  states: ['NSW', 'VIC'],
  catchment: undefined,
  provenance: { problems: prov(), 'intake.phone': prov(), 'intake.url': prov() },
});
const vic = svc({ id: 'vic-lac', name: 'Victoria Legal Aid', kind: 'legal_aid_commission', states: ['VIC'] });

const all = [commission, local, wide, atsils, national, vic];
const q = (extra) => ({ state: 'NSW', problem: 'tenancy', ...extra });

test('local catchment match outranks the state commission, narrower first', () => {
  const r = findFirstContact(all, q({ postcode: '2005' }));
  assert.equal(r.status, 'ok');
  assert.deepEqual(
    r.services.map((s) => s.id),
    ['inner-clc', 'wide-clc', 'nsw-lac', 'national-line'],
  );
  assert.deepEqual(
    r.services.map((s) => s.rank),
    [1, 2, 3, 4],
  );
  assert.equal(r.services[0].tier, 'specific');
  assert.equal(r.services[2].tier, 'state');
  assert.equal(r.services[3].tier, 'national');
});

test('without a postcode local services are not eligible', () => {
  const r = findFirstContact(all, q());
  assert.deepEqual(
    r.services.map((s) => s.id),
    ['nsw-lac', 'national-line'],
  );
});

test('a postcode outside the catchment excludes the local service', () => {
  const r = findFirstContact([local, commission], q({ postcode: '2500' }));
  assert.deepEqual(
    r.services.map((s) => s.id),
    ['nsw-lac'],
  );
});

test('other states are excluded', () => {
  const r = findFirstContact(all, q({ state: 'VIC' }));
  assert.deepEqual(
    r.services.map((s) => s.id),
    ['vic-lac', 'national-line'],
  );
});

test('a cultural match ranks first and a missing circumstance leaves it out', () => {
  const asked = findFirstContact(all, {
    state: 'NSW',
    problem: 'criminal',
    circumstances: { aboriginal_torres_strait_islander: true },
  });
  assert.equal(asked.services[0].id, 'nsw-atsils');
  assert.equal(asked.services[0].tier, 'specific');
  const unasked = findFirstContact(all, { state: 'NSW', problem: 'criminal' });
  assert.ok(!unasked.services.some((s) => s.id === 'nsw-atsils'));
});

test('an exact problem outranks general within a tier', () => {
  const exact = svc({ id: 'exact', name: 'Zed exact', problems: ['tenancy'] });
  const r = findFirstContact([commission, exact], q());
  assert.deepEqual(
    r.services.map((s) => s.id),
    ['exact', 'nsw-lac'],
  );
});

test('unreviewed records are not served unless asked for', () => {
  const draft = svc({ id: 'draft', review: 'unreviewed' });
  const none = findFirstContact([draft], q());
  assert.equal(none.status, 'none_reviewed');
  assert.deepEqual(none.services, []);
  const shown = findFirstContact([draft], q(), { includeUnreviewed: true });
  assert.equal(shown.status, 'ok');
});

test('output is capped and always carries the notice', () => {
  const many = Array.from({ length: 9 }, (_, i) => svc({ id: `s${i}`, name: `S${i}` }));
  const r = findFirstContact(many, q());
  assert.equal(r.services.length, MAX_RESULTS);
  assert.equal(r.notice, NOTICE);
  assert.equal(findFirstContact([], q()).notice, NOTICE);
});

test('a referral reports contact, source and the oldest checked date', () => {
  const s = svc({
    provenance: {
      catchment: prov(),
      problems: prov(),
      'intake.phone': prov('https://example.org/phone', '2026-10-01'),
      'intake.url': prov('https://example.org/contact', '2026-11-05'),
    },
  });
  const [r] = findFirstContact([s], q()).services;
  assert.equal(r.phone, '1300 000 000');
  assert.equal(r.url, 'https://example.org/contact');
  assert.equal(r.source, 'https://example.org/contact');
  assert.equal(r.checked, '2026-10-01');
});

test('a field the service does not state is absent, never invented', () => {
  const s = svc({ intake: { url: 'https://example.org/contact' }, provenance: { problems: prov(), catchment: prov(), 'intake.url': prov() } });
  const [r] = findFirstContact([s], q()).services;
  assert.equal('phone' in r, false);
  assert.equal('hours' in r, false);
});

test('parseQuery normalises and rejects bad input', () => {
  assert.deepEqual(parseQuery({ state: 'nsw', problem: 'tenancy', postcode: '2000' }), {
    query: { state: 'NSW', problem: 'tenancy', postcode: '2000' },
  });
  assert.ok('error' in parseQuery({ state: 'XX', problem: 'tenancy' }));
  assert.ok('error' in parseQuery({ state: 'NSW', problem: 'astrology' }));
  assert.ok('error' in parseQuery({ state: 'NSW', problem: 'tenancy', postcode: '20' }));
  assert.ok('error' in parseQuery({ state: 'NSW', problem: 'tenancy', circumstances: { family_violence: 'yes' } }));
  assert.ok('error' in parseQuery(null));
});

test('validateServices accepts a well-formed set', () => {
  assert.deepEqual(validateServices(all, '2026-11-11'), []);
});

test('validateServices names each rule it enforces', () => {
  const bad = (overrides) => validateServices([svc(overrides)], '2026-11-11').join('\n');
  assert.match(bad({ intake: { phone: '1300 000 000' }, provenance: { catchment: prov(), problems: prov() } }), /intake\.phone has no provenance/);
  assert.match(bad({ provenance: { catchment: prov('http://example.org'), problems: prov(), 'intake.phone': prov(), 'intake.url': prov() } }), /must be https/);
  assert.match(bad({ provenance: { catchment: prov(undefined, '2026-02-30'), problems: prov(), 'intake.phone': prov(), 'intake.url': prov() } }), /not a past calendar date/);
  assert.match(bad({ provenance: { catchment: prov(undefined, '2027-01-01'), problems: prov(), 'intake.phone': prov(), 'intake.url': prov() } }), /not a past calendar date/);
  assert.match(bad({ catchment: { postcodes: ['3006-3000'] } }), /bad postcode or range/);
  assert.match(bad({ catchment: { postcodes: ['30'] } }), /bad postcode or range/);
  assert.match(bad({ level: 'local', catchment: { statewide: true } }), /local service needs/);
  assert.match(bad({ id: 'Bad Id' }), /kebab-case/);
  assert.match(bad({ provenance: { catchment: prov(), problems: prov(), 'intake.phone': prov(), 'intake.url': prov(), eligibility: prov() } }), /eligibility has provenance but no value/);
  const dup = validateServices([svc({}), svc({})], '2026-11-11').join('\n');
  assert.match(dup, /duplicate id/);
});

test('validateServices fails every contact-field and structural rule on a bad record and names it', () => {
  const full = { catchment: prov(), problems: prov(), 'intake.phone': prov(), 'intake.url': prov() };
  const bad = (overrides, provenance = full) => validateServices([svc({ provenance, ...overrides })], '2026-11-11');
  const cases = [
    [{ intake: { phone: 'call us', url: 'https://example.org/contact' } }, /svc: phone has no digits/],
    [{ intake: { phone: '1300 000 000', url: 'http://example.org/contact' } }, /svc: intake\.url must be https/],
    [{ intake: { phone: '1300 000 000', url: 'not a url' } }, /svc: intake\.url must be https/],
    [{ name: '' }, /svc: name is required/],
    [{ kind: 'directory' }, /svc: unknown kind directory/],
    [{ level: 'regional' }, /svc: unknown level regional/],
    [{ states: [] }, /svc: states must be a non-empty list/],
    [{ states: ['XX'] }, /svc: states must be a non-empty list/],
    [{ review: 'maybe' }, /svc: review must be unreviewed or reviewed/],
    [{ problems: ['astrology'] }, /svc: unknown problem astrology/],
    [{ cultural: ['martian'], provenance: { ...full, cultural: prov() } }, /svc: unknown cultural focus martian/],
    [{ catchment: { postcodes: [] } }, /svc: catchment is empty/],
    [{ catchment: { postcodes: ['2000-1999'] } }, /svc: bad postcode or range 2000-1999/],
    [{ catchment: { postcodes: ['20000'] } }, /svc: bad postcode or range 20000/],
  ];
  for (const [overrides, pattern] of cases) {
    const errors = bad(overrides).join('\n');
    assert.match(errors, pattern, JSON.stringify(overrides));
  }
  const noProv = { catchment: prov(), problems: prov(), 'intake.url': prov() };
  assert.match(bad({}, noProv).join('\n'), /svc: intake\.phone has no provenance/);
  assert.match(bad({}, { ...full, 'intake.url': undefined }).join('\n'), /svc: intake\.url has no provenance/);
  assert.match(bad({}, { ...full, 'intake.url': { url: 'https://example.org', checked: '2026-13-01' } }).join('\n'), /svc: intake\.url provenance date 2026-13-01/);
  assert.match(bad({}, { ...full, bogus: prov() }).join('\n'), /svc: unknown provenance key bogus/);
  assert.match(bad({ intake: undefined }, full).join('\n'), /intake\.phone has provenance but no value/);
  assert.deepEqual(bad({}), []);
});

async function getRoute(query) {
  const { GET } = await import('../app/api/first-contact/route.ts');
  return GET(new Request(`http://127.0.0.1/api/first-contact?${query}`));
}

test('GET /api/first-contact turns "true"/"false" into booleans for the gates', async () => {
  const base = 'state=VIC&problem=family_violence&postcode=3000';
  const withAtsi = await (await getRoute(`${base}&aboriginal_torres_strait_islander=true`)).json();
  const withoutAtsi = await (await getRoute(`${base}&aboriginal_torres_strait_islander=false`)).json();
  assert.equal(withAtsi.status, 'none_reviewed');
  assert.equal(withoutAtsi.status, 'none_reviewed');
  for (const key of ['aboriginal_torres_strait_islander', 'under_18', 'family_violence']) {
    for (const v of ['yes', '1', 'TRUE']) {
      const res = await getRoute(`${base}&${key}=${v}`);
      assert.equal(res.status, 400, `${key}=${v}`);
      assert.match((await res.json()).error, /must be true or false/);
    }
  }
});

test('GET /api/first-contact returns 400 on bad input with an error body', async () => {
  for (const q of ['', 'state=VIC', 'problem=general', 'state=XX&problem=general', 'state=VIC&problem=astrology', 'state=VIC&problem=general&postcode=30']) {
    const res = await getRoute(q);
    assert.equal(res.status, 400, q);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
    assert.equal(body.services, undefined);
  }
});

test('GET /api/first-contact sets JSON content type and no-store on success, with the notice', async () => {
  const res = await getRoute('state=NSW&problem=general');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal((await res.json()).notice, NOTICE);
});

test('tool definition is read-only and requires state and problem', () => {
  assert.equal(TOOL_DEFINITION.name, 'find_first_contact');
  assert.equal(TOOL_DEFINITION.annotations.readOnlyHint, true);
  assert.deepEqual(TOOL_DEFINITION.inputSchema.required, ['state', 'problem']);
});

test('the shipped service data validates', () => {
  const data = JSON.parse(readFileSync(new URL('../lib/first-contact-services.json', import.meta.url), 'utf8'));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
  assert.deepEqual(validateServices(data, today), []);
  assert.ok(data.length > 0);
  assert.ok(data.every((d) => d.review === 'reviewed' || d.review === 'unreviewed'));
});

test('an Aboriginal-only service needs the circumstance, even for a family violence query', () => {
  const fvpls = svc({
    id: 'fvpls',
    name: 'FVPLS',
    kind: 'fvpls',
    cultural: ['aboriginal_torres_strait_islander', 'family_violence'],
    problems: ['family_violence'],
    provenance: { catchment: prov(), problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() },
  });
  const base = { state: 'NSW', problem: 'family_violence' };
  const without = findFirstContact([fvpls, commission], { ...base, circumstances: { family_violence: true } });
  assert.deepEqual(without.services.map((s) => s.id), ['nsw-lac']);
  const withIt = findFirstContact([fvpls, commission], {
    ...base,
    circumstances: { family_violence: true, aboriginal_torres_strait_islander: true },
  });
  assert.equal(withIt.services[0].id, 'fvpls');
});

test('an FVPLS is offered only when family violence is also stated', () => {
  const fvpls = svc({
    id: 'fvpls',
    name: 'FVPLS',
    kind: 'fvpls',
    cultural: ['aboriginal_torres_strait_islander'],
    problems: ['family_law', 'child_protection'],
    provenance: { catchment: prov(), problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() },
  });
  const q = { state: 'NSW', problem: 'family_law', circumstances: { aboriginal_torres_strait_islander: true } };
  assert.deepEqual(findFirstContact([fvpls, commission], q).services.map((x) => x.id), ['nsw-lac']);
  const withFv = { ...q, circumstances: { ...q.circumstances, family_violence: true } };
  assert.equal(findFirstContact([fvpls, commission], withFv).services[0].id, 'fvpls');
  const fvProblem = { state: 'NSW', problem: 'family_violence', circumstances: { aboriginal_torres_strait_islander: true } };
  assert.equal(findFirstContact([{ ...fvpls, problems: ['family_violence'] }, commission], fvProblem).services[0].id, 'fvpls');
});

test('an under-18 service is offered only when under_18 is stated', () => {
  const youth = svc({
    id: 'youth',
    name: 'Youth line',
    cultural: ['under_18'],
    provenance: { catchment: prov(), problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() },
  });
  assert.deepEqual(findFirstContact([youth, commission], q()).services.map((s) => s.id), ['nsw-lac']);
  assert.equal(findFirstContact([youth, commission], q({ circumstances: { under_18: true } })).services[0].id, 'youth');
});

test('a referral carries per-field sources', () => {
  const [r] = findFirstContact([commission], q()).services;
  assert.equal(r.sources['intake.phone'].url, 'https://example.org/page');
  assert.equal(r.sources['intake.url'].checked, '2026-11-01');
});

test('status separates no match from nothing reviewed, and two statewide services sort stably', () => {
  assert.equal(findFirstContact([commission], { state: 'NSW', problem: 'tenancy', postcode: '2000' }).status, 'ok');
  assert.equal(findFirstContact([atsils], q()).status, 'no_match');
  assert.equal(findFirstContact([svc({ review: 'unreviewed' })], q()).status, 'none_reviewed');
  const a = svc({ id: 'a', name: 'A' });
  const b = svc({ id: 'b', name: 'B' });
  assert.deepEqual(findFirstContact([b, a], q()).services.map((s) => s.id), ['a', 'b']);
});

test('lookup on the shipped data serves only reviewed records', async () => {
  const { lookup, SERVICES } = await import('../lib/first-contact-data.ts');
  const reviewed = new Set(SERVICES.filter((s) => s.review === 'reviewed').map((s) => s.id));
  for (const state of ['NSW', 'VIC']) {
    const out = lookup({ state, problem: 'general', circumstances: { aboriginal_torres_strait_islander: true, under_18: true, family_violence: true } });
    assert.ok(out.result.services.every((r) => reviewed.has(r.id)));
    if (!reviewed.size) assert.equal(out.result.status, 'none_reviewed');
  }
  assert.ok('error' in lookup({ state: 'NSW', problem: 'astrology' }));
});

test('a national service with a gated focus needs the circumstance', () => {
  const nat = svc({ id: 'nat-youth', level: 'national', catchment: undefined, cultural: ['under_18'], provenance: { problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() } });
  assert.deepEqual(findFirstContact([nat], q()).services, []);
  assert.equal(findFirstContact([nat], q({ circumstances: { under_18: true } })).services[0].id, 'nat-youth');
});

test('family_violence boosts but does not hide a state service', () => {
  const fv = svc({ id: 'fv', cultural: ['family_violence'], provenance: { catchment: prov(), problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() } });
  assert.equal(findFirstContact([fv], q()).services[0].tier, 'state');
  assert.equal(findFirstContact([fv], q({ circumstances: { family_violence: true } })).services[0].tier, 'specific');
});

async function rpc(body, headers = {}) {
  const { POST } = await import('../app/mcp/route.ts');
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await POST(new Request('http://127.0.0.1/mcp', { method: 'POST', body: text, headers }));
  return { status: res.status, json: res.status === 202 ? null : await res.json() };
}

test('mcp: initialize, tools/list and tools/call', async () => {
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(list.json.result.tools[0].name, 'find_first_contact');
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'find_first_contact', arguments: { state: 'NSW', problem: 'general' } } });
  assert.equal(call.json.result.structuredContent.notice, NOTICE);
  const bad = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'find_first_contact', arguments: { state: 'XX', problem: 'general' } } });
  assert.equal(bad.json.result.isError, true);
});

test('mcp: errors and notifications', async () => {
  assert.equal((await rpc('{nope')).json.error.code, -32700);
  assert.equal((await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).json.error.code, -32600);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'nope' })).json.error.code, -32601);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'other' } })).json.error.code, -32602);
  assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping', pad: 'x'.repeat(17000) })).json.error.message, 'Request too large');
  assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { 'content-length': '99999' })).json.error.message, 'Request too large');
  const { POST } = await import('../app/mcp/route.ts');
  const chunk = new TextEncoder().encode('x'.repeat(8192));
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(chunk);
      c.enqueue(chunk);
      c.enqueue(chunk);
      c.close();
    },
  });
  const res = await POST(new Request('http://127.0.0.1/mcp', { method: 'POST', body: stream, duplex: 'half' }));
  assert.equal((await res.json()).error.message, 'Request too large');
});

test('parseQuery rejects unknown and array circumstances', () => {
  assert.ok('error' in parseQuery({ state: 'NSW', problem: 'general', circumstances: { astrology: true } }));
  assert.ok('error' in parseQuery({ state: 'NSW', problem: 'general', circumstances: [] }));
  assert.ok('query' in parseQuery({ state: 'NSW', problem: 'general', circumstances: { under_18: true } }));
});

test('a state service with a postcode catchment is not returned outside it', () => {
  const regional = svc({ id: 'vic-central', states: ['VIC'], level: 'state', catchment: { postcodes: ['3000-3099'] } });
  assert.deepEqual(findFirstContact([regional], q({ state: 'VIC', postcode: '3500' })).services, []);
  assert.equal(findFirstContact([regional], q({ state: 'VIC', postcode: '3050' })).services[0].id, 'vic-central');
  const specialist = svc({ id: 'vic-atsils', states: ['VIC'], level: 'state', cultural: ['aboriginal_torres_strait_islander'], catchment: { postcodes: ['3000-3099'] }, provenance: { catchment: prov(), problems: prov(), cultural: prov(), 'intake.phone': prov(), 'intake.url': prov() } });
  assert.deepEqual(findFirstContact([specialist], q({ state: 'VIC', postcode: '3500', circumstances: { aboriginal_torres_strait_islander: true } })).services, []);
});
