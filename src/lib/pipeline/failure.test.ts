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
