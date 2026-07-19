/* @vitest-environment node */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeSourceUrl,
  assertExpectedSourceDestination,
  retrieveSource,
  retrieveSourceOverHttp1,
  SourceFetchError,
} from './fetch';

describe('retrieveSource', () => {
  it('returns retrieval evidence and a stable content hash', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html><body><h1>AI policy</h1></body></html>', {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            etag: '"abc"',
            'last-modified': 'Wed, 15 Jul 2026 00:00:00 GMT',
          },
        }),
    ) as unknown as typeof fetch;

    const result = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(result.body).toContain('AI policy');
    expect(result.evidence).toMatchObject({
      url: 'https://example.gov.au/policy',
      finalUrl: 'https://example.gov.au/policy',
      retrievedAt: '2026-07-16T00:00:00.000Z',
      contentType: 'text/html',
      etag: '"abc"',
      lastModified: 'Wed, 15 Jul 2026 00:00:00 GMT',
    });
    expect(result.evidence.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the HTML fingerprint when a linked instrument changes at the same URL', async () => {
    const documentBodies = [
      '%PDF-1.4\npolicy document version 1',
      '%PDF-1.4\npolicy document version 2',
    ];
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/files/policy.pdf')) {
            return new Response(documentBodies.shift(), {
              status: 200,
              headers: { 'content-type': 'application/pdf' },
            });
          }
          return new Response(
            '<html><body><a href="/files/policy.pdf">Download policy</a></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' },
            },
          );
        },
      );

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.evidence.linkedDocuments).toEqual([
      expect.objectContaining({
        url: 'https://example.gov.au/files/policy.pdf',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(first.linkedSources).toEqual([
      expect.objectContaining({
        bytes: expect.any(Uint8Array),
        evidence: expect.objectContaining({
          url: 'https://example.gov.au/files/policy.pdf',
        }),
      }),
    ]);
    expect(first.linkedSources?.[0]?.body).toBe('');
    expect(first.evidence.contentHash).not.toBe(
      second.evidence.contentHash,
    );
  });

  it('hashes linked instruments from recognizable HTML with a generic MIME type', async () => {
    const documentBodies = [
      '%PDF-1.4\npolicy document version 1',
      '%PDF-1.4\npolicy document version 2',
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/files/policy.pdf')) {
        return new Response(documentBodies.shift(), {
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response(
        '<!doctype html><html><body><main><a href="/files/policy.pdf">Download AI policy</a></main></body></html>',
        { headers: { 'content-type': 'application/octet-stream' } },
      );
    });

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.evidence.linkedDocuments).toEqual([
      expect.objectContaining({
        url: 'https://example.gov.au/files/policy.pdf',
      }),
    ]);
    expect(first.evidence.contentHash).not.toBe(second.evidence.contentHash);
  });

  it('normalizes MIME casing before linked-instrument verification', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/files/policy.pdf')) {
        return new Response('%PDF-1.4\npolicy document', {
          headers: { 'content-type': 'Application/PDF' },
        });
      }
      return new Response(
        '<html><body><main><h1>AI policy</h1><a href="/files/policy.pdf">AI policy instrument</a></main></body></html>',
        { headers: { 'content-type': 'Text/HTML; Charset=UTF-8' } },
      );
    });

    const result = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.evidence.contentType).toBe('text/html');
    expect(result.evidence.linkedDocuments).toEqual([
      expect.objectContaining({
        contentType: 'application/pdf',
        url: 'https://example.gov.au/files/policy.pdf',
      }),
    ]);
  });

  it('rejects a recognized policy instrument linked over non-HTTPS transport', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<html><body><main><h1>AI policy</h1><a href="http://example.gov.au/files/policy.pdf">AI policy instrument</a></main></body></html>',
          { headers: { 'content-type': 'text/html' } },
        ),
    ) as unknown as typeof fetch;

    await expect(
      retrieveSource('https://example.gov.au/policy', { fetchImpl }),
    ).rejects.toThrow('not a safe public HTTPS source');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('enforces one aggregate byte budget across linked documents', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('.pdf')) {
        return new Response('%PDF-1.4\nstable-document', {
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response(
        `<main><h1>AI policy</h1>
          <a href="/one.pdf">AI policy document one</a>
          <a href="/two.pdf">AI policy document two</a>
        </main>`,
        { headers: { 'content-type': 'text/html' } },
      );
    });

    await expect(
      retrieveSource('https://example.gov.au/policy', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxLinkedDocumentBytes: 40,
      }),
    ).rejects.toThrow('byte limit');
  });

  it('uses canonical page headings to identify generically labelled policy downloads', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) =>
        String(input).endsWith('/media/123.pdf')
          ? new Response('%PDF-1.4\nAI policy document', {
              headers: { 'content-type': 'application/pdf' },
            })
          : new Response(
              '<main><h1>AI policy</h1><a href="/media/123.pdf">Download PDF</a></main>',
              { headers: { 'content-type': 'text/html' } },
            ),
    );

    const result = await retrieveSource(
      'https://example.gov.au/ai-policy',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.evidence.linkedDocuments).toEqual([
      expect.objectContaining({
        url: 'https://example.gov.au/media/123.pdf',
      }),
    ]);
  });

  it('accepts linked Word and RTF documents only when their byte signatures match', async () => {
    const oldWordBytes = Uint8Array.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00,
    ]);
    const docxBytes = Uint8Array.from(
      Buffer.from(
        'PK\u0003\u0004...[Content_Types].xml...word/document.xml',
        'utf8',
      ),
    );
    const rtfBytes = Uint8Array.from(
      Buffer.from('{\\rtf1\\ansi AI policy}', 'utf8'),
    );
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/policy.docx')) {
          return new Response(docxBytes, {
            headers: {
              'content-type':
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          });
        }
        if (url.endsWith('/policy.doc')) {
          return new Response(oldWordBytes, {
            headers: { 'content-type': 'application/msword' },
          });
        }
        if (url.endsWith('/policy.rtf')) {
          return new Response(rtfBytes, {
            headers: { 'content-type': 'application/rtf' },
          });
        }
        return new Response(
          `<html><body><main>
            <a href="/policy.docx">Policy DOCX</a>
            <a href="/policy.doc">Policy DOC</a>
            <a href="/policy.rtf">Policy RTF</a>
          </main></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        );
      },
    );

    const result = await retrieveSource(
      'https://example.gov.au/policy',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.evidence.linkedDocuments).toHaveLength(3);
  });

  it('infers an extensionless document type from its signature without requiring a download attribute', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/media/123/download?inline=')) {
          return new Response('%PDF-1.4\npolicy document', {
            headers: { 'content-type': 'application/octet-stream' },
          });
        }
        return new Response(
          '<html><body><main><a href="/media/123/download?inline">Download AI policy</a></main></body></html>',
          { headers: { 'content-type': 'text/html' } },
        );
      },
    );

    const result = await retrieveSource(
      'https://example.gov.au/policy',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.evidence.linkedDocuments).toEqual([
      expect.objectContaining({
        url: 'https://example.gov.au/media/123/download?inline=',
        contentType: 'application/octet-stream',
      }),
    ]);
  });

  it('does not treat an ordinary HTML policy link as a binary attachment', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<html><body><main><a href="/policy-details">Read the AI policy document</a></main></body></html>',
          { headers: { 'content-type': 'text/html' } },
        ),
    );

    const result = await retrieveSource(
      'https://example.gov.au/publications',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.evidence.linkedDocuments).toBeUndefined();
    expect(result.linkedSources).toBeUndefined();
  });

  it('does not fingerprint an unrelated document merely because it has a PDF extension', async () => {
    const responses = [
      '/reports/annual-report-2025.pdf',
      '/reports/annual-report-2026.pdf',
    ];
    const fetchImpl = vi.fn(async () =>
        new Response(
          `<html><body><main><h1>AI policy</h1><p>Policy details.</p><a href="${responses.shift()}">Corporate annual report</a></main></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        ));

    const first = await retrieveSource(
      'https://example.gov.au/ai-policy',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    const second = await retrieveSource(
      'https://example.gov.au/ai-policy',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(first.evidence.linkedDocuments).toBeUndefined();
    expect(second.evidence.linkedDocuments).toBeUndefined();
    expect(first.evidence.contentHash).toBe(second.evidence.contentHash);
  });

  it('rejects landing pages whose linked policy document is not retrievable as a document', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/files/policy.pdf')) {
          return new Response('Access denied', {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          });
        }
        return new Response(
          '<html><body><a href="/files/policy.pdf">Download policy</a></body></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        );
      },
    );

    await expect(
      retrieveSource('https://example.gov.au/policy', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('failed PDF byte validation');
  });

  it('does not change a policy fingerprint for navigation or stylesheet churn', async () => {
    const responses = [
      `<html><head><link rel="stylesheet" href="/assets/v1.css"></head><body>
        <header><a href="/news">News</a></header>
        <main><h1>AI policy</h1><p>Stable obligations.</p></main>
        <footer>Updated footer</footer>
      </body></html>`,
      `<html><head><link rel="stylesheet" href="/assets/v2.css"></head><body>
        <header><a href="/media">Media centre</a></header>
        <main><h1>AI policy</h1><p>Stable obligations.</p></main>
        <footer>Different footer</footer>
      </body></html>`,
    ];
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL) => {
          if (String(input).endsWith('.pdf')) {
            return new Response('%PDF-1.4\nstable policy document', {
              status: 200,
              headers: { 'content-type': 'application/pdf' },
            });
          }
          return new Response(responses.shift(), {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        },
      );

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.evidence.contentHash).toBe(second.evidence.contentHash);
  });

  it('does not change a fingerprint for canonically equivalent document references', async () => {
    const responses = [
      `<html><body><main><h1>AI policy</h1>
        <a href="/files/policy.pdf?b=2&utm_source=newsletter&a=1#download">AI policy document</a>
      </main></body></html>`,
      `<html><body><main><h1>AI policy</h1>
        <a href="https://example.gov.au/files/policy.pdf?a=1&b=2&utm_campaign=launch">AI policy document</a>
      </main></body></html>`,
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/files/policy.pdf')
        ? new Response('%PDF-1.4\nstable policy document', {
            headers: { 'content-type': 'application/pdf' },
          })
        : new Response(responses.shift(), {
            headers: { 'content-type': 'text/html' },
          }),
    );

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.evidence.linkedDocuments?.[0]?.url).toBe(
      'https://example.gov.au/files/policy.pdf?a=1&b=2',
    );
    expect(first.evidence.contentHash).toBe(second.evidence.contentHash);
  });

  it('changes the fingerprint when semantic article-header content changes', async () => {
    const responses = [
      `<html><body><main><article>
        <header><h1>AI policy</h1><a href="/policy-v1.pdf">Policy document</a></header>
        <p>Stable obligations.</p>
      </article></main></body></html>`,
      `<html><body><main><article>
        <header><h1>AI policy amended</h1><a href="/policy-v2.pdf">Policy document</a></header>
        <p>Stable obligations.</p>
      </article></main></body></html>`,
    ];
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL) => {
          if (String(input).endsWith('.pdf')) {
            return new Response('%PDF-1.4\nstable policy document', {
              status: 200,
              headers: { 'content-type': 'application/pdf' },
            });
          }
          return new Response(responses.shift(), {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        },
      );

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.evidence.contentHash).not.toBe(
      second.evidence.contentHash,
    );
  });

  it('changes the fingerprint when supported datePublished metadata changes', async () => {
    const responses = ['2026-07-01', '2026-07-02'];
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          `<html><head><meta itemprop="datePublished" content="${responses.shift()}"></head><body><main><h1>AI policy</h1><p>Stable obligations.</p></main></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        ),
    ) as unknown as typeof fetch;

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl,
    });

    expect(first.evidence.contentHash).not.toBe(
      second.evidence.contentHash,
    );
  });

  it('hashes binary sources without UTF-8 replacement corruption', async () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0x00, 0x25, 0x50, 0x44, 0x46]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    ) as unknown as typeof fetch;

    const result = await retrieveSource('https://example.gov.au/policy.pdf', {
      fetchImpl,
    });

    expect(result.evidence.contentHash).toBe(
      '03ca485dd79f6bbe13cf7039127687908f4ed4b46acae179c2db8d2e10ac47d6',
    );
  });

  it('hashes document bytes before trusting a misleading HTML content type', async () => {
    const responses = [
      Uint8Array.from([
        ...Buffer.from('%PDF-1.4\n', 'utf8'),
        0xff,
        ...Buffer.from('\npolicy', 'utf8'),
      ]),
      Uint8Array.from([
        ...Buffer.from('%PDF-1.4\n', 'utf8'),
        0xfe,
        ...Buffer.from('\npolicy', 'utf8'),
      ]),
    ];
    const fetchImpl = vi.fn(
      async () =>
        new Response(responses.shift(), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    ) as unknown as typeof fetch;

    const first = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl,
    });
    const second = await retrieveSource('https://example.gov.au/policy', {
      fetchImpl,
    });

    expect(first.evidence.contentHash).not.toBe(
      second.evidence.contentHash,
    );
  });

  it('rejects oversized responses from their declared content length', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('oversized', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            'content-length': '100',
          },
        }),
    );

    await expect(
      retrieveSource('https://example.gov.au/oversized', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxResponseBytes: 8,
      }),
    ).rejects.toThrow('exceeds 8 byte limit');
  });

  it('stops streaming a response after the configured byte limit', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
              controller.enqueue(Uint8Array.from([5, 6, 7, 8]));
              controller.close();
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          },
        ),
    );

    await expect(
      retrieveSource('https://example.gov.au/oversized.pdf', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxResponseBytes: 7,
      }),
    ).rejects.toThrow('exceeds 7 byte limit');
  });

  it('retries transient responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('<h1>Recovered</h1>', { status: 200 }));
    const sleep = vi.fn(async () => undefined);

    const result = await retrieveSource('https://example.gov.au/news', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 10,
      sleep,
    });

    expect(result.body).toContain('Recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('does not retry permanent responses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('missing', { status: 404 }),
    );

    await expect(
      retrieveSource('https://example.gov.au/missing', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      status: 404,
      retryable: false,
    } satisfies Partial<SourceFetchError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects HTTP 200 bot challenges as failed retrievals', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<script>AwsWafIntegration.checkForceRefresh()</script><h1>JavaScript is disabled</h1><p>verify that you&#39;re not a robot</p>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        ),
    );

    await expect(
      retrieveSource('https://example.gov.au/protected', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('bot-challenge page');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects HTML bot challenges mislabelled as binary content', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<script>AwsWafIntegration.checkForceRefresh()</script><p>verify that you&#39;re not a robot</p>',
          {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          },
        ),
    );

    await expect(
      retrieveSource('https://example.gov.au/protected-binary', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('bot-challenge page');
  });

  it('rejects unsafe URLs before the HTTP/1.1 fallback connects', async () => {
    await expect(
      retrieveSourceOverHttp1('http://127.0.0.1/protected', {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow('allow-listed official host');
  });

  it('rejects redirects away from the official-source allow-list', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/private' },
        }),
    );

    await expect(
      retrieveSource('https://example.gov.au/start', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'destination_mismatch',
      message: expect.stringContaining('allow-listed official host'),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects candidate documents redirected to the official site homepage', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.gov.au/' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<main>Government homepage</main>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

    await expect(
      retrieveSource('https://example.gov.au/news/deleted-ai-policy', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('site homepage');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects official hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeSourceUrl(
        'https://example.gov.au/private',
        async () => ['127.0.0.1'],
      ),
    ).rejects.toThrow('blocked network address');
  });

  it.each([
    '240.0.0.1',
    '255.255.255.255',
    '100::1',
    'fec0::1',
    '2001:db8::1',
    '2002:a00:1::1',
    '3fff::1',
  ])('rejects non-public routable address %s', async (address) => {
    await expect(
      assertSafeSourceUrl(
        'https://policy.example.com/analysis',
        async () => [address],
        'public-https',
      ),
    ).rejects.toThrow('blocked network address');
  });

  it('allows a globally routable IPv6 address', async () => {
    await expect(
      assertSafeSourceUrl(
        'https://policy.example.com/analysis',
        async () => ['2606:4700:4700::1111'],
        'public-https',
      ),
    ).resolves.toEqual(['2606:4700:4700::1111']);
  });

  it('rejects a non-root source redirected to the site homepage', () => {
    expect(() =>
      assertExpectedSourceDestination(
        'https://example.gov.au/publications/ai',
        {
          body: '<main>Homepage</main>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/publications/ai',
            finalUrl: 'https://example.gov.au/',
          },
        },
      ),
    ).toThrow('site homepage');
  });

  it.each(['/home', '/index.html', '/default.aspx'])(
    'rejects a non-root source redirected to homepage alias %s',
    (homepagePath) => {
      expect(() =>
        assertExpectedSourceDestination(
          'https://example.gov.au/policy/instrument',
          {
            body: '<main>Generic landing page</main>',
            durationMs: 1,
            evidence: {
              url: 'https://example.gov.au/policy/instrument',
              finalUrl: `https://example.gov.au${homepagePath}`,
            },
          },
        ),
      ).toThrow('site homepage');
    },
  );

  it('rejects a query-selected root document redirected to a selector-less homepage', () => {
    expect(() =>
      assertExpectedSourceDestination(
        'https://example.gov.au/?document=123',
        {
          body: '<main>Homepage</main>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/?document=123',
            finalUrl: 'https://example.gov.au/',
          },
        },
      ),
    ).toThrow('site homepage');
  });

  it('rejects a non-root document redirected to a homepage with unrelated query state', () => {
    expect(() =>
      assertExpectedSourceDestination(
        'https://example.gov.au/publications/ai-policy',
        {
          body: '<main>Homepage</main>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/publications/ai-policy',
            finalUrl: 'https://example.gov.au/?from=archive',
          },
        },
      ),
    ).toThrow('site homepage');
  });

  it('rejects a root document selector redirected to an unrelated query', () => {
    expect(() =>
      assertExpectedSourceDestination(
        'https://example.gov.au/?document=123',
        {
          body: '<main>Homepage</main>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/?document=123',
            finalUrl: 'https://example.gov.au/?from=archive',
          },
        },
      ),
    ).toThrow('site homepage');
  });

  it('accepts a non-root source redirected to a root document selector', () => {
    expect(() =>
      assertExpectedSourceDestination(
        'https://example.gov.au/policy',
        {
          body: '%PDF-1.4\nPolicy',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/policy',
            finalUrl: 'https://example.gov.au/?document=123',
          },
        },
      ),
    ).not.toThrow();
  });

  it('tries each validated DNS address within the shared deadline', async () => {
    const pinnedAddresses: string[] = [];
    const addressFamilies: number[] = [];
    let callCount = 0;
    const requestImpl = vi.fn(
      (
        _url: URL,
        requestOptions: {
          family?: number;
          lookup: (
            hostname: string,
            options: object,
            callback: (
              error: Error | null,
              address: string,
              family: number,
            ) => void,
          ) => void;
        },
        onResponse: (response: PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        }) => void,
      ) => {
        if (requestOptions.family) {
          addressFamilies.push(requestOptions.family);
        }
        const request = new EventEmitter() as EventEmitter & {
          setTimeout: (
            milliseconds: number,
            callback: () => void,
          ) => typeof request;
          destroy: (error?: Error) => typeof request;
        };
        request.setTimeout = vi.fn(() => request);
        request.destroy = vi.fn((error?: Error) => {
          if (error) queueMicrotask(() => request.emit('error', error));
          return request;
        });
        queueMicrotask(() => {
          requestOptions.lookup(
            'example.gov.au',
            {},
            (_error, address) => pinnedAddresses.push(address),
          );
          callCount++;
          if (callCount === 1) {
            request.emit('error', new Error('first address unreachable'));
            return;
          }
          const response = new PassThrough() as PassThrough & {
            statusCode: number;
            headers: Record<string, string>;
          };
          response.statusCode = 200;
          response.headers = { 'content-type': 'text/html' };
          onResponse(response);
          response.end('<main><h1>Recovered source</h1></main>');
        });
        return request;
      },
    );

    const result = await retrieveSourceOverHttp1(
      'https://example.gov.au/policy',
      {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 1_000,
        resolveHost: async () => [
          '2606:4700:4700::1111',
          '8.8.8.8',
        ],
        requestImpl:
          requestImpl as unknown as typeof import('node:https').get,
      },
    );

    expect(result.body).toContain('Recovered source');
    expect(pinnedAddresses).toEqual([
      '2606:4700:4700::1111',
      '8.8.8.8',
    ]);
    expect(addressFamilies).toEqual([6, 4]);
  });

  it('tries the next validated DNS address after a retryable HTTP response', async () => {
    const pinnedAddresses: string[] = [];
    let callCount = 0;
    const requestImpl = vi.fn(
      (
        _url: URL,
        requestOptions: {
          lookup: (
            hostname: string,
            options: object,
            callback: (
              error: Error | null,
              address: string,
              family: number,
            ) => void,
          ) => void;
        },
        onResponse: (response: PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        }) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          setTimeout: (
            milliseconds: number,
            callback: () => void,
          ) => typeof request;
          destroy: (error?: Error) => typeof request;
        };
        request.setTimeout = vi.fn(() => request);
        request.destroy = vi.fn((error?: Error) => {
          if (error) queueMicrotask(() => request.emit('error', error));
          return request;
        });
        queueMicrotask(() => {
          requestOptions.lookup(
            'example.gov.au',
            {},
            (_error, address) => pinnedAddresses.push(address),
          );
          callCount++;
          const response = new PassThrough() as PassThrough & {
            statusCode: number;
            headers: Record<string, string>;
          };
          response.statusCode = callCount === 1 ? 503 : 200;
          response.headers = { 'content-type': 'text/html' };
          onResponse(response);
          if (callCount > 1) {
            response.end('<main><h1>Recovered source</h1></main>');
          }
        });
        return request;
      },
    );

    const result = await retrieveSourceOverHttp1(
      'https://example.gov.au/policy',
      {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 1_000,
        resolveHost: async () => ['8.8.8.8', '1.1.1.1'],
        requestImpl:
          requestImpl as unknown as typeof import('node:https').get,
      },
    );

    expect(result.body).toContain('Recovered source');
    expect(pinnedAddresses).toEqual(['8.8.8.8', '1.1.1.1']);
  });

  it('rejects a malformed HTTP/1.1 redirect without leaving the request pending', async () => {
    const requestImpl = vi.fn(
      (
        _url: URL,
        _requestOptions: object,
        onResponse: (response: PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        }) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          setTimeout: (
            milliseconds: number,
            callback: () => void,
          ) => typeof request;
          destroy: (error?: Error) => typeof request;
        };
        request.setTimeout = vi.fn(() => request);
        request.destroy = vi.fn((error?: Error) => {
          if (error) queueMicrotask(() => request.emit('error', error));
          return request;
        });
        queueMicrotask(() => {
          const response = new PassThrough() as PassThrough & {
            statusCode: number;
            headers: Record<string, string>;
          };
          response.statusCode = 302;
          response.headers = { location: 'https://[invalid-host' };
          onResponse(response);
        });
        return request;
      },
    );

    await expect(
      retrieveSourceOverHttp1('https://example.gov.au/policy', {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 100,
        resolveHost: async () => ['8.8.8.8'],
        requestImpl:
          requestImpl as unknown as typeof import('node:https').get,
      }),
    ).rejects.toThrow();
  });

  it('includes DNS resolution in the total retrieval deadline', async () => {
    const requestImpl = vi.fn();

    await expect(
      retrieveSourceOverHttp1('https://example.gov.au/policy', {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 20,
        resolveHost: async () =>
          new Promise<string[]>(() => undefined),
        requestImpl:
          requestImpl as unknown as typeof import('node:https').get,
      }),
    ).rejects.toThrow('Timed out after 20ms');

    expect(requestImpl).not.toHaveBeenCalled();
  });

  it('hard-times out each DNS address so a trickling endpoint cannot consume failover time', async () => {
    let callCount = 0;
    const requestImpl = vi.fn(
      (
        _url: URL,
        requestOptions: {
          lookup: (
            hostname: string,
            options: object,
            callback: (
              error: Error | null,
              address: string,
              family: number,
            ) => void,
          ) => void;
        },
        onResponse: (response: PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        }) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          setTimeout: (
            milliseconds: number,
            callback: () => void,
          ) => typeof request;
          destroy: (error?: Error) => typeof request;
        };
        request.setTimeout = vi.fn(() => request);
        request.destroy = vi.fn((error?: Error) => {
          if (error) queueMicrotask(() => request.emit('error', error));
          return request;
        });
        queueMicrotask(() => {
          callCount++;
          requestOptions.lookup(
            'example.gov.au',
            {},
            () => undefined,
          );
          if (callCount === 1) {
            // Simulate a connection that never completes. The hard per-address
            // timer, not socket inactivity, must trigger failover.
            return;
          }
          const response = new PassThrough() as PassThrough & {
            statusCode: number;
            headers: Record<string, string>;
          };
          response.statusCode = 200;
          response.headers = { 'content-type': 'text/html' };
          onResponse(response);
          response.end('<main><h1>Second address succeeded</h1></main>');
        });
        return request;
      },
    );

    const result = await retrieveSourceOverHttp1(
      'https://example.gov.au/policy',
      {
        now: () => new Date('2026-07-16T00:00:00.000Z'),
        timeoutMs: 120,
        resolveHost: async () => ['8.8.8.8', '1.1.1.1'],
        requestImpl:
          requestImpl as unknown as typeof import('node:https').get,
      },
    );

    expect(result.body).toContain('Second address succeeded');
    expect(callCount).toBe(2);
  });

  it('allows explicitly stage-only public HTTPS retrieval with private networks still blocked', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<main><h1>Independent AI policy analysis</h1></main>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );

    const result = await retrieveSource(
      'https://policy.example.com/analysis',
      {
        destinationPolicy: 'public-https',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolveHost: async () => ['8.8.8.8'],
      },
    );

    expect(result.body).toContain('Independent AI policy analysis');
    await expect(
      assertSafeSourceUrl(
        'https://policy.example.com/private',
        async () => ['10.0.0.1'],
        'public-https',
      ),
    ).rejects.toThrow('blocked network address');
  });

  it('uses the pinned HTTP/1.1 retriever as the production transport', async () => {
    const fallback = vi.fn(async () => ({
      body: '<h1>HTTP/1.1 response</h1>',
      durationMs: 5,
      evidence: {
        url: 'https://example.gov.au/news',
        finalUrl: 'https://example.gov.au/news',
        retrievedAt: '2026-07-16T00:00:00.000Z',
        contentType: 'text/html',
        contentHash: 'a'.repeat(64),
      },
    }));
    const originalFetch = globalThis.fetch;
    const globalFetch = vi.fn();
    globalThis.fetch = globalFetch as unknown as typeof fetch;

    try {
      const result = await retrieveSource('https://example.gov.au/news', {
        http1Fallback: fallback,
        resolveHost: async () => ['8.8.8.8'],
      });

      expect(result.body).toContain('HTTP/1.1 response');
      expect(fallback).toHaveBeenCalledOnce();
      expect(fallback).toHaveBeenCalledWith(
        'https://example.gov.au/news',
        expect.objectContaining({
          timeoutMs: 20_000,
          maxResponseBytes: 20 * 1024 * 1024,
          destinationPolicy: 'official',
          resolveHost: expect.any(Function),
          deadlineAt: expect.any(Number),
          startedAt: expect.any(Number),
        }),
      );
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
