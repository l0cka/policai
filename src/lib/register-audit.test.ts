/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { retrieveSource, SourceFetchError } from '@/lib/pipeline/fetch';
import { validatePolicies } from '@/lib/validate-data';
import {
  applyRegisterAuditEvidence,
  auditRegister,
  registerAuditRetrievalOptions,
} from './register-audit';

async function retrieveSourceForAudit(
  url: string,
  options: Parameters<typeof retrieveSource>[1],
) {
  return retrieveSource(url, options);
}

const CURRENT_EVIDENCE = {
  url: 'https://example.gov.au/policy',
  finalUrl: 'https://example.gov.au/policy',
  retrievedAt: '2026-07-16T00:00:00.000Z',
  contentType: 'text/html',
  contentHash: 'b'.repeat(64),
};

describe('register audit', () => {
  it('records unchanged-source audit completion after retrieval evidence', async () => {
    const policy = buildPolicy();
    let retrievalCompleted = false;
    const results = await auditRegister([policy], {
      retrieve: async () => {
        retrievalCompleted = true;
        return {
          body: '<h1>Unchanged policy</h1>',
          durationMs: 300_000,
          evidence: {
            ...CURRENT_EVIDENCE,
            retrievedAt: '2026-07-16T00:05:00.000Z',
            contentHash: policy.verification.source.contentHash,
          },
        };
      },
      now: () =>
        new Date(
          retrievalCompleted
            ? '2026-07-16T00:06:00.000Z'
            : '2026-07-16T00:00:00.000Z',
        ),
    });

    expect(results[0]).toMatchObject({
      status: 'unchanged',
      checkedAt: '2026-07-16T00:06:00.000Z',
    });
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.lastSourceAuditAt).toBe(
      '2026-07-16T00:06:00.000Z',
    );
    expect(validatePolicies(updated).errors).toEqual([]);
  });

  it('stores a missing baseline but requires editorial re-verification', async () => {
    const policy = buildPolicy({
      verification: {
        status: 'verified',
        source: { url: 'https://example.gov.au/policy' },
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'editor',
        method: 'manual',
      },
    });
    const results = await auditRegister([policy], {
      retrieve: async () => ({
        body: '<h1>Policy</h1>',
        durationMs: 1,
        evidence: CURRENT_EVIDENCE,
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0].status).toBe('baseline_missing');
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.status).toBe('stale');
    expect(updated[0].verification.source.contentHash).toBe('b'.repeat(64));
    expect(updated[0].verification.lastSourceAuditAt).toBe(
      '2026-07-16T00:00:00.000Z',
    );
    expect(updated[0].verification.notes).toContain(
      'without an editorial content comparison',
    );
  });

  it('marks a record stale when its official source hash changes', async () => {
    const policy = buildPolicy({
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policy',
          contentHash: 'a'.repeat(64),
        },
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'editor',
        method: 'manual',
      },
    });
    const results = await auditRegister([policy], {
      retrieve: async () => ({
        body: '<h1>Changed policy</h1>',
        durationMs: 1,
        evidence: CURRENT_EVIDENCE,
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0].status).toBe('changed');
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.status).toBe('stale');
    expect(updated[0].verification.source.contentHash).toBe('a'.repeat(64));
    expect(updated[0].verification.lastSourceAuditAt).toBe(
      '2026-07-16T00:00:00.000Z',
    );
    expect(updated[0].verification.notes).toContain(
      'editorial re-verification is required',
    );

    const repeated = await auditRegister(updated, {
      retrieve: async () => ({
        body: '<h1>Changed policy</h1>',
        durationMs: 1,
        evidence: CURRENT_EVIDENCE,
      }),
      now: () => new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(repeated[0]).toMatchObject({
      status: 'changed',
      previousHash: 'a'.repeat(64),
    });
  });

  it('compares matching linked-document bytes across browser and server evidence', async () => {
    const documentUrl = 'https://example.gov.au/policy.pdf';
    const policy = buildPolicy({
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policy',
          contentHash: 'a'.repeat(64),
          linkedDocuments: [
            {
              url: documentUrl,
              contentHash: 'c'.repeat(64),
            },
          ],
          browserCapture: {
            method: 'browser',
            capturedAt: '2026-07-15T00:00:00.000Z',
            capturedBy: 'editor',
            notes: 'Fresh browser capture of the official policy source.',
            pageContentHash: 'd'.repeat(64),
            characterCount: 100,
          },
        },
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'editor',
        method: 'manual',
      },
    });
    const results = await auditRegister([policy], {
      retrieve: async () => ({
        body: '<h1>Server-rendered page representation</h1>',
        durationMs: 1,
        evidence: {
          ...CURRENT_EVIDENCE,
          contentHash: 'e'.repeat(64),
          linkedDocuments: [
            {
              url: documentUrl,
              contentHash: 'c'.repeat(64),
            },
          ],
        },
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'unchanged',
      comparisonBasis: 'linked_documents',
      previousHash: 'a'.repeat(64),
    });
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.source).toEqual(
      policy.verification.source,
    );
    expect(updated[0].verification.lastSourceAuditAt).toBe(
      '2026-07-16T00:00:00.000Z',
    );
  });

  it('preserves true change detection when linked-document bytes change', async () => {
    const documentUrl = 'https://example.gov.au/policy.pdf';
    const policy = buildPolicy({
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policy',
          contentHash: 'a'.repeat(64),
          linkedDocuments: [
            {
              url: documentUrl,
              contentHash: 'c'.repeat(64),
            },
          ],
          browserCapture: {
            method: 'browser',
            capturedAt: '2026-07-15T00:00:00.000Z',
            capturedBy: 'editor',
            notes: 'Fresh browser capture of the official policy source.',
            pageContentHash: 'd'.repeat(64),
            characterCount: 100,
          },
        },
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'editor',
        method: 'manual',
      },
    });
    const results = await auditRegister([policy], {
      retrieve: async () => ({
        body: '<h1>Server-rendered page representation</h1>',
        durationMs: 1,
        evidence: {
          ...CURRENT_EVIDENCE,
          contentHash: 'e'.repeat(64),
          linkedDocuments: [
            {
              url: documentUrl,
              contentHash: 'f'.repeat(64),
            },
          ],
        },
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'changed',
      comparisonBasis: 'linked_documents',
    });
    expect(
      applyRegisterAuditEvidence([policy], results)[0].verification.status,
    ).toBe('stale');
  });

  it('reports incompatible browser and server-only fingerprints without a false change alert', async () => {
    const policy = buildPolicy({
      verification: {
        status: 'verified',
        source: {
          url: 'https://example.gov.au/policy',
          contentHash: 'a'.repeat(64),
          browserCapture: {
            method: 'browser',
            capturedAt: '2026-07-15T00:00:00.000Z',
            capturedBy: 'editor',
            notes: 'Fresh browser capture of the official policy source.',
            pageContentHash: 'd'.repeat(64),
            characterCount: 100,
          },
        },
        checkedAt: '2026-07-15T00:00:00.000Z',
        checkedBy: 'editor',
        method: 'manual',
      },
    });
    const results = await auditRegister([policy], {
      retrieve: async () => ({
        body: '<h1>Server-rendered page representation</h1>',
        durationMs: 1,
        evidence: CURRENT_EVIDENCE,
      }),
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'comparison_unavailable',
      error: expect.stringContaining('not directly comparable'),
    });
    expect(applyRegisterAuditEvidence([policy], results)).toEqual([policy]);
  });

  it('reports retrieval failures without changing the record', async () => {
    const policy = buildPolicy();
    const results = await auditRegister([policy], {
      retrieve: async () => {
        throw new Error('HTTP 403');
      },
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'retrieval_failed',
      error: 'HTTP 403',
    });
    expect(applyRegisterAuditEvidence([policy], results)).toEqual([policy]);
  });

  it('marks a record stale when the official source is confirmed missing', async () => {
    const policy = buildPolicy();
    const results = await auditRegister([policy], {
      retrieve: async () => {
        throw new SourceFetchError('HTTP 404', {
          status: 404,
          retryable: false,
        });
      },
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'source_missing',
      httpStatus: 404,
    });
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.status).toBe('stale');
    expect(updated[0].verification.notes).toContain(
      'official source returned HTTP 404',
    );
  });

  it('marks a record stale when its document permanently redirects to the homepage', async () => {
    const policy = buildPolicy();
    const results = await auditRegister([policy], {
      retrieve: async () => {
        throw new SourceFetchError(
          'Source redirected from /policy to the site homepage',
          {
            retryable: false,
            code: 'destination_mismatch',
          },
        );
      },
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'source_missing',
      error: expect.stringContaining('site homepage'),
    });
    const updated = applyRegisterAuditEvidence([policy], results);
    expect(updated[0].verification.status).toBe('stale');
    expect(updated[0].verification.notes).toContain(
      'no longer resolves to the requested official document',
    );
  });

  it('marks a record stale when its source redirects off the official allow-list', async () => {
    const policy = buildPolicy();
    const results = await auditRegister([policy], {
      retrieve: async () => {
        throw new SourceFetchError(
          'Source URL must be HTTPS on an allow-listed official host',
          {
            retryable: false,
            code: 'destination_mismatch',
          },
        );
      },
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(results[0]).toMatchObject({
      status: 'source_missing',
      error: expect.stringContaining('allow-listed official host'),
    });
    expect(
      applyRegisterAuditEvidence([policy], results)[0].verification.status,
    ).toBe('stale');
  });
});

describe('register audit retrieval retry', () => {
  it('retries a transient timeout once and still reports retrieval_failed when the retry also fails', async () => {
    const policy = buildPolicy();
    const calls: number[] = [];
    const sleep = vi.fn(async () => undefined);
    const results = await auditRegister([policy], {
      retrieve: async () => {
        calls.push(Date.now());
        throw new SourceFetchError('Timed out after 45000ms', {
          retryable: true,
        });
      },
      sleep,
      retryDelayMs: 1_000,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(results[0]).toMatchObject({
      status: 'retrieval_failed',
      error: 'Timed out after 45000ms',
    });
    expect(applyRegisterAuditEvidence([policy], results)).toEqual([policy]);
  });

  it('recovers a source when the first attempt times out and the retry succeeds', async () => {
    const policy = buildPolicy();
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const results = await auditRegister([policy], {
      retrieve: async () => {
        calls += 1;
        if (calls === 1) {
          throw new SourceFetchError('Timed out after 45000ms', {
            retryable: true,
          });
        }
        return {
          body: '<h1>Recovered on retry</h1>',
          durationMs: 1,
          evidence: {
            ...CURRENT_EVIDENCE,
            contentHash: policy.verification.source.contentHash,
          },
        };
      },
      sleep,
      retryDelayMs: 1_000,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ status: 'unchanged' });
  });

  it('recovers a source when the first attempt fails with a transient 5xx and the retry succeeds', async () => {
    const policy = buildPolicy();
    let calls = 0;
    const results = await auditRegister([policy], {
      retrieve: async () => {
        calls += 1;
        if (calls === 1) {
          throw new SourceFetchError('HTTP 503', {
            status: 503,
            retryable: true,
          });
        }
        return {
          body: '<h1>Recovered after 503</h1>',
          durationMs: 1,
          evidence: {
            ...CURRENT_EVIDENCE,
            contentHash: policy.verification.source.contentHash,
          },
        };
      },
      sleep: async () => undefined,
      retryDelayMs: 1_000,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(calls).toBe(2);
    expect(results[0]).toMatchObject({ status: 'unchanged' });
  });

  it('never retries client errors such as HTTP 403', async () => {
    const policy = buildPolicy();
    const fetchImpl = vi
      .fn<(input: string) => Promise<Response>>()
      .mockResolvedValue(new Response('forbidden', { status: 403 }));
    const error = await retrieveSourceForAudit(
      'https://example.gov.au/walled',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    ).catch((caught: unknown) => caught);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      name: 'SourceFetchError',
      status: 403,
      retryable: false,
    });

    let calls = 0;
    const results = await auditRegister([policy], {
      retrieve: async () => {
        calls += 1;
        throw new SourceFetchError('HTTP 403', {
          status: 403,
          retryable: false,
        });
      },
      sleep: async () => undefined,
      retryDelayMs: 1_000,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });
    expect(calls).toBe(1);
    expect(results[0]).toMatchObject({
      status: 'retrieval_failed',
      httpStatus: 403,
      error: 'HTTP 403',
    });
  });

  it('retries a fake transient failure via a custom retrieve exactly once', async () => {
    const policy = buildPolicy();
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const results = await auditRegister([policy], {
      retrieve: async () => {
        calls += 1;
        if (calls === 1) {
          throw new SourceFetchError('read ETIMEDOUT', { retryable: true });
        }
        return {
          body: '<h1>Recovered on retry</h1>',
          durationMs: 1,
          evidence: {
            ...CURRENT_EVIDENCE,
            contentHash: policy.verification.source.contentHash,
          },
        };
      },
      sleep,
      retryDelayMs: 500,
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    });

    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(results[0]).toMatchObject({ status: 'unchanged' });
  });

  it('defaults to a 45s timeout, exactly one retry, and a 1s backoff', () => {
    expect(registerAuditRetrievalOptions({})).toEqual({
      timeoutMs: 45_000,
      attempts: 2,
      retryDelayMs: 1_000,
    });
  });

  it('resolves retrieval options from environment overrides and rejects invalid values', () => {
    expect(
      registerAuditRetrievalOptions({
        AUDIT_REGISTER_TIMEOUT_MS: '90000',
        AUDIT_REGISTER_ATTEMPTS: '1',
        AUDIT_REGISTER_RETRY_DELAY_MS: '250',
      }),
    ).toEqual({ timeoutMs: 90_000, attempts: 1, retryDelayMs: 250 });
    expect(
      registerAuditRetrievalOptions({
        AUDIT_REGISTER_TIMEOUT_MS: '',
      }),
    ).toEqual({ timeoutMs: 45_000, attempts: 2, retryDelayMs: 1_000 });

    expect(() =>
      registerAuditRetrievalOptions({
        AUDIT_REGISTER_ATTEMPTS: '0',
      }),
    ).toThrow('must be a positive integer');
    expect(() =>
      registerAuditRetrievalOptions({
        AUDIT_REGISTER_TIMEOUT_MS: 'fast',
      }),
    ).toThrow('must be a positive integer');
    expect(() =>
      registerAuditRetrievalOptions({
        AUDIT_REGISTER_ATTEMPTS: '3.5',
      }),
    ).toThrow('must be a positive integer');
  });

  it('passes resolved timeout and single-retry settings to retrieveSource', async () => {
    const policy = buildPolicy();
    const retrieveSource = await import('./pipeline/fetch');
    const spy = vi.spyOn(retrieveSource, 'retrieveSource');
    try {
      spy.mockImplementation(
        (async () => ({
          body: '<h1>Unchanged policy</h1>',
          durationMs: 1,
          evidence: {
            ...CURRENT_EVIDENCE,
            contentHash: policy.verification.source.contentHash,
          },
        })) as unknown as typeof retrieveSource.retrieveSource,
      );
      const results = await auditRegister([policy], {
        timeoutMs: 45_000,
      });
      expect(spy).toHaveBeenCalledWith(
        policy.sourceUrl,
        expect.objectContaining({
          timeoutMs: 45_000,
          attempts: 1,
        }),
      );
      expect(results[0]).toMatchObject({ status: 'unchanged' });
    } finally {
      spy.mockRestore();
    }
  });
});
