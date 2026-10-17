import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAILURE_CLASSES, classifyFailure, type FailureClass } from './failure';
import { SourceFetchError } from './fetch';

const FINANCE_PDF =
  'https://www.finance.gov.au/sites/default/files/2024-06/National-framework-for-the-assurance-of-AI-in-government.pdf';

const REAL_STRINGS: Array<[string, FailureClass, string | null]> = [
  ['HTTP 403', 'identity_refused', null],
  [
    `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at ${FINANCE_PDF}\nCall log:\n  - navigating to "${FINANCE_PDF}", waiting until "load"\n`,
    'identity_refused',
    FINANCE_PDF,
  ],
  [
    'page.goto: net::ERR_CONNECTION_RESET at https://www.example.gov.au/news',
    'identity_refused',
    'https://www.example.gov.au/news',
  ],
  ['read ECONNRESET', 'identity_refused', null],
  ['Received a bot-challenge page instead of source content', 'identity_refused', null],
  ['HTTP 429', 'rate_limited', null],
  ['HTTP 502', 'host_unavailable', null],
  ['HTTP 503', 'host_unavailable', null],
  [
    'page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://statements.qld.gov.au/',
    'host_unavailable',
    'https://statements.qld.gov.au/',
  ],
  ['DNS lookup failed for www.example.gov.au', 'host_unavailable', null],
  ['Source host did not resolve to a usable address', 'host_unavailable', null],
  ['HTTP 404', 'not_found', null],
  ['HTTP 410', 'not_found', null],
  ['HTTP 401', 'http_error', null],
  ['The operation was aborted due to timeout', 'timeout', null],
  ['page.goto: Timeout 45000ms exceeded.', 'timeout', null],
  ['Timed out after 20000ms', 'timeout', null],
  ['Source returned no usable index or feed items', 'empty', null],
  ['Source returned no extractable index or feed items', 'empty', null],
  ['Source returned 2 usable items; at least 3 are required', 'empty', null],
  [
    'Linked policy document https://www.example.gov.au/a.pdf returned no document bytes',
    'empty',
    'https://www.example.gov.au/a.pdf',
  ],
  [
    'PDF contains no extractable text; OCR or manual transcription is required',
    'parse',
    null,
  ],
  ['HTML source contains no readable document text', 'parse', null],
  ['DOCX central directory is malformed', 'parse', null],
  ['Invalid PDF structure.', 'parse', null],
  [
    'Unsupported source content type image/png; only HTML, plain text, XML, and text-bearing PDFs can be extracted',
    'parse',
    null,
  ],
  [
    'Source redirected from /news to the site homepage',
    'other',
    null,
  ],
  ['Something nobody anticipated', 'other', null],
  ['PDF retrieval did not retain the original document bytes', 'other', null],
  ['Source response exceeds 20971520 byte limit', 'other', null],
  ['connect ETIMEDOUT 203.0.113.7:443', 'timeout', null],
  ['page.goto: net::ERR_TIMED_OUT at https://www.example.gov.au/a', 'timeout', 'https://www.example.gov.au/a'],
  ['Invalid keepAliveTimeout setting', 'other', null],
  [
    `HTTP 403 at ${FINANCE_PDF}`,
    'identity_refused',
    FINANCE_PDF,
  ],
  [
    'Fetch of https://www.example.gov.au/private disallowed by robots.txt',
    'robots_disallowed',
    'https://www.example.gov.au/private',
  ],
];

describe('classifyFailure', () => {
  it.each(REAL_STRINGS)('classifies %j', (message, cls, url) => {
    expect(classifyFailure(new Error(message))).toEqual({ cls, url });
    expect(classifyFailure(message)).toEqual({ cls, url });
  });

  it('classifies a SourceFetchError by its message', () => {
    expect(
      classifyFailure(new SourceFetchError('HTTP 403', { status: 403 })),
    ).toEqual({ cls: 'identity_refused', url: null });
  });

  it('labels a value that is neither an Error nor a string as other', () => {
    expect(classifyFailure({ code: 42 })).toEqual({ cls: 'other', url: null });
    expect(classifyFailure(undefined)).toEqual({ cls: 'other', url: null });
  });

  it('labels a refusal that robots.txt explains as robots_disallowed', () => {
    expect(
      classifyFailure('HTTP 403: https://www.example.gov.au/a disallowed by robots.txt'),
    ).toEqual({ cls: 'robots_disallowed', url: 'https://www.example.gov.au/a' });
  });

  it('takes the first of two different URLs', () => {
    expect(
      classifyFailure(
        'HTTP 403 at https://www.finance.gov.au/a.pdf linked from https://www.example.gov.au/policy',
      ).url,
    ).toBe('https://www.finance.gov.au/a.pdf');
  });

  it('prefers the URL a SourceFetchError carries over its message', () => {
    expect(
      classifyFailure(
        new SourceFetchError('HTTP 403 while reading https://www.example.gov.au/policy', {
          status: 403,
          url: FINANCE_PDF,
        }),
      ),
    ).toEqual({ cls: 'identity_refused', url: FINANCE_PDF });
    expect(
      classifyFailure(new SourceFetchError('HTTP 403', { status: 403, url: FINANCE_PDF })),
    ).toEqual({ cls: 'identity_refused', url: FINANCE_PDF });
  });

  it.each([
    ['see https://www.example.gov.au/a]', 'https://www.example.gov.au/a'],
    ['{"u":https://www.example.gov.au/a}', 'https://www.example.gov.au/a'],
    ['at `https://www.example.gov.au/a`', 'https://www.example.gov.au/a'],
    ['at "https://www.example.gov.au/a"!', 'https://www.example.gov.au/a'],
    ['at https://www.example.gov.au/a?!', 'https://www.example.gov.au/a'],
    ['at HTTPS://WWW.Example.GOV.AU/Path', 'https://www.example.gov.au/Path'],
    ['at https://user:secret@www.example.gov.au/a', 'https://www.example.gov.au/a'],
    ['at https://www.example.gov.au/a?auth=token#frag', 'https://www.example.gov.au/a'],
    ['bare https:// then https://www.example.gov.au/a', 'https://www.example.gov.au/a'],
    ['only https:// here', null],
    [`at https://www.example.gov.au/${'a'.repeat(2100)}`, 'https://www.example.gov.au/'],
  ])('extracts a public failed URL (case %#)', (message, url) => {
    expect(classifyFailure(message).url).toBe(url);
  });

  it('strips credentials and the query from the carried URL', () => {
    expect(
      classifyFailure(
        new SourceFetchError('HTTP 403', {
          status: 403,
          url: 'https://u:p@www.example.gov.au/a?X-Amz-Signature=abc',
        }),
      ).url,
    ).toBe('https://www.example.gov.au/a');
  });

  it('reads the cause and AggregateError members of fetch failed', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 203.0.113.7:443'), {
      code: 'ECONNREFUSED',
    });
    const reset = Object.assign(new Error(''), { code: 'ECONNRESET' });
    expect(classifyFailure(new TypeError('fetch failed', { cause: refused })).cls).toBe(
      'host_unavailable',
    );
    expect(classifyFailure(new TypeError('fetch failed', { cause: reset })).cls).toBe(
      'identity_refused',
    );
    expect(
      classifyFailure(
        new TypeError('fetch failed', { cause: new AggregateError([refused], '') }),
      ).cls,
    ).toBe('host_unavailable');
    expect(
      classifyFailure(
        new SourceFetchError('fetch failed', {
          cause: new TypeError('fetch failed', { cause: reset }),
        }),
      ).cls,
    ).toBe('identity_refused');
  });

  it('lets the top-level message decide before its cause', () => {
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    expect(
      classifyFailure(new SourceFetchError('Timed out after 20000ms', { cause: reset })).cls,
    ).toBe('timeout');
  });

  it('extracts the first URL without trailing punctuation', () => {
    expect(
      classifyFailure(
        'pending https://www.example.gov.au/media/ai-update. (HTTP 404)',
      ),
    ).toEqual({ cls: 'not_found', url: 'https://www.example.gov.au/media/ai-update' });
  });
});

describe('FAILURE_CLASSES', () => {
  it('has exactly one row per class in the union', () => {
    const union: Record<FailureClass, true> = {
      identity_refused: true,
      robots_disallowed: true,
      rate_limited: true,
      host_unavailable: true,
      not_found: true,
      http_error: true,
      timeout: true,
      empty: true,
      parse: true,
      other: true,
    };
    const rows = FAILURE_CLASSES.map((row) => row.cls);
    expect(new Set(rows).size).toBe(rows.length);
    expect([...rows].sort()).toEqual(Object.keys(union).sort());
    expect(rows.at(-1)).toBe('other');
  });

  it('checks robots.txt before the identity heuristics', () => {
    const rows = FAILURE_CLASSES.map((row) => row.cls);
    expect(rows.indexOf('robots_disallowed')).toBeLessThan(rows.indexOf('identity_refused'));
  });

  it('matches the failure class table in docs/collector.md', () => {
    const doc = readFileSync(
      path.join(process.cwd(), 'docs', 'collector.md'),
      'utf8',
    );
    const section = doc.split('### Failure classes')[1]?.split('\n#')[0] ?? '';
    const documented = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(
      (match) => match[1],
    );
    expect(documented).toEqual(FAILURE_CLASSES.map((row) => row.cls));
  });
});
