/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { SourceFetchError } from '@/lib/pipeline/fetch';
import { validatePolicies } from '@/lib/validate-data';
import {
  applyRegisterAuditEvidence,
  auditRegister,
} from './register-audit';

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
