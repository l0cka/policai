/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { buildRecordReviewSchedule } from '@/lib/coverage-report';
import {
  applyRegisterAuditEvidence,
  type RegisterAuditResult,
} from '@/lib/register-audit';
import { validatePolicies } from '@/lib/validate-data';
import {
  approveReconfirmBatch,
  proposeReconfirmBatches,
  reconfirmApprovalSubject,
  ReconfirmError,
  selectReconfirmCandidates,
  validateReconfirmLedger,
  type ReconfirmLedger,
} from './register-reconfirm';
import type { Policy } from '@/types';
import { softwarePasskey } from '@/test/software-passkey';

const NOW = new Date('2026-11-01T00:00:00.000Z');
const CARD = 'https://claude.ai/code/project/chan_x?thread=cmsg_y';
const HASH = 'a'.repeat(64);

function policy(id: string, checkedAt: string, hash = HASH): Policy {
  const base = buildPolicy({ id, title: `Record ${id}` });
  return {
    ...base,
    sourceUrl: `https://example.gov.au/${id}`,
    verification: {
      ...base.verification,
      checkedAt,
      checkedBy: 'Daniel Alkurdi',
      notes: 'Approved after reading the official source.',
      source: { url: `https://example.gov.au/${id}`, contentHash: hash },
    },
  };
}

function audit(
  record: Policy,
  status: RegisterAuditResult['status'],
  checkedAt = '2026-10-31T00:00:00.000Z',
): RegisterAuditResult {
  return {
    policyId: record.id,
    title: record.title,
    sourceUrl: record.sourceUrl,
    status,
    checkedAt,
    previousHash: record.verification.source.contentHash,
    currentEvidence: {
      url: record.sourceUrl,
      retrievedAt: checkedAt,
      contentHash: status === 'changed' ? 'c'.repeat(64) : record.verification.source.contentHash,
    },
    comparisonBasis: 'content_hash',
  };
}

function propose(policies: Policy[], audits: RegisterAuditResult[], ledger: ReconfirmLedger = { batches: [] }, batchSize?: number) {
  const candidates = selectReconfirmCandidates(policies, ledger, { now: NOW });
  const audited = applyRegisterAuditEvidence(policies, audits);
  return { audited, ...proposeReconfirmBatches(candidates, audits, audited, ledger, { now: NOW, batchSize }) };
}

describe('register re-confirmation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const dueSoon = policy('due-soon', '2026-08-25T00:00:00.000Z');
  const overdue = policy('overdue', '2026-07-01T00:00:00.000Z');
  const recent = policy('recent', '2026-10-20T00:00:00.000Z');
  const changed = policy('changed', '2026-08-24T00:00:00.000Z');

  it('batches due records whose source is unchanged and sends the rest to full review', () => {
    const policies = [dueSoon, overdue, recent, changed];
    const { batches, fullReview } = propose(policies, [
      audit(dueSoon, 'unchanged'),
      audit(overdue, 'unchanged'),
      audit(changed, 'changed'),
    ]);

    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe('2026-11-01-1');
    expect(batches[0].entries.map((entry) => entry.policyId).sort()).toEqual(['due-soon', 'overdue']);
    expect(fullReview).toEqual([{ policyId: 'changed', title: 'Record changed', reason: 'changed' }]);
  });

  it('never proposes a record twice while its batch is open', () => {
    const first = propose([dueSoon], [audit(dueSoon, 'unchanged')]);
    const ledger = { batches: first.batches };
    const second = propose(first.audited, [audit(dueSoon, 'unchanged')], ledger);
    expect(second.batches).toEqual([]);
    expect(second.fullReview).toEqual([]);
  });

  it('splits large sets into batches with ids unique in the ledger', () => {
    const many = Array.from({ length: 5 }, (_, index) => policy(`r${index}`, '2026-08-25T00:00:00.000Z'));
    const ledger = { batches: [{ id: '2026-11-01-1', proposedAt: NOW.toISOString(), proposedBy: 'x', entries: [], decision: { approvedBy: 'D', approvedAt: NOW.toISOString(), attestationUrl: CARD } }] };
    const { batches } = propose(many, many.map((record) => audit(record, 'unchanged')), ledger, 2);
    expect(batches.map((batch) => [batch.id, batch.entries.length])).toEqual([
      ['2026-11-01-2', 2],
      ['2026-11-01-3', 2],
      ['2026-11-01-4', 1],
    ]);
  });

  it('renews every record in an approved batch so none is due for 90 days', () => {
    const { audited, batches } = propose([dueSoon, overdue], [audit(dueSoon, 'unchanged'), audit(overdue, 'unchanged')]);
    const approvedAt = '2026-11-02T03:00:00.000Z';
    const result = approveReconfirmBatch(audited, { batches }, batches[0].id, {
      approvedBy: 'Daniel Alkurdi',
      approvedAt,
      attestationUrl: CARD,
    });

    const schedule = buildRecordReviewSchedule(result.policies, new Date('2027-01-30T00:00:00.000Z'));
    expect(schedule.every((row) => !row.overdue)).toBe(true);
    const renewed = result.policies.find((record) => record.id === 'due-soon')!;
    expect(renewed.verification).toMatchObject({ status: 'verified', checkedAt: approvedAt, checkedBy: 'Daniel Alkurdi' });
    expect(renewed.verification.notes).toContain(`Re-confirmed in batch ${batches[0].id}`);
    expect(renewed.verification.notes).toContain(CARD);
    expect(result.ledger.batches[0].decision?.attestationUrl).toBe(CARD);
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00.000Z') });
    expect(validatePolicies(result.policies, new Set(), { requireLegislative: false }).errors).toEqual([]);
    expect(validateReconfirmLedger(result.ledger, result.policies)).toEqual({ errors: [], warnings: [] });
  });

  it('accepts a passkey approval only for the batch and entries it signed', () => {
    const { audited, batches } = propose([dueSoon, overdue], [audit(dueSoon, 'unchanged'), audit(overdue, 'unchanged')]);
    const editor = softwarePasskey();
    const approvedAt = '2026-11-02T03:00:00.000Z';
    const signed = editor.approve(reconfirmApprovalSubject(batches[0]), { receivedAt: approvedAt });
    const decision = { approvedBy: 'Daniel Alkurdi', approvedAt, approval: signed };

    const result = approveReconfirmBatch(audited, { batches }, batches[0].id, decision);
    expect(result.policies.find((record) => record.id === 'due-soon')!.verification.notes).toContain('(passkey approval)');
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00.000Z') });
    expect(validateReconfirmLedger(result.ledger, result.policies)).toEqual({ errors: [], warnings: [] });

    const fewer = { ...batches[0], entries: batches[0].entries.slice(1) };
    expect(() => approveReconfirmBatch(audited, { batches: [fewer] }, fewer.id, decision)).toThrow(
      'the passkey approval is for a different batch or different entries',
    );
  });

  it('keeps one re-confirmation note when a record is re-confirmed again', () => {
    const first = propose([dueSoon], [audit(dueSoon, 'unchanged')]);
    const once = approveReconfirmBatch(first.audited, { batches: first.batches }, first.batches[0].id, {
      approvedBy: 'Daniel Alkurdi',
      approvedAt: '2026-11-02T00:00:00.000Z',
      attestationUrl: CARD,
    });
    const later = new Date('2027-01-20T00:00:00.000Z');
    const record = once.policies[0];
    const candidates = selectReconfirmCandidates(once.policies, once.ledger, { now: later });
    const audits = [audit(record, 'unchanged', '2027-01-19T00:00:00.000Z')];
    const audited = applyRegisterAuditEvidence(once.policies, audits);
    const second = proposeReconfirmBatches(candidates, audits, audited, once.ledger, { now: later });
    const twice = approveReconfirmBatch(audited, { batches: [...once.ledger.batches, ...second.batches] }, second.batches[0].id, {
      approvedBy: 'Daniel Alkurdi',
      approvedAt: '2027-01-20T00:00:00.000Z',
      attestationUrl: CARD,
    });
    const notes = twice.policies[0].verification.notes!;
    expect(notes.match(/Re-confirmed in batch/g)).toHaveLength(1);
    expect(notes).toContain(second.batches[0].id);
    expect(notes.startsWith('Approved after reading the official source.')).toBe(true);
  });

  it('refuses the whole batch when a fingerprint changed or an audit is too old', () => {
    const { audited, batches } = propose([dueSoon, overdue], [
      audit(dueSoon, 'unchanged', '2026-10-20T00:00:00.000Z'),
      audit(overdue, 'unchanged'),
    ]);
    const drifted = audited.map((record) =>
      record.id === 'overdue'
        ? { ...record, verification: { ...record.verification, source: { ...record.verification.source, contentHash: 'd'.repeat(64) } } }
        : record,
    );

    let error: unknown;
    try {
      approveReconfirmBatch(drifted, { batches }, batches[0].id, {
        approvedBy: 'Daniel Alkurdi',
        approvedAt: '2026-11-02T00:00:00.000Z',
        attestationUrl: CARD,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ReconfirmError);
    expect((error as ReconfirmError).problems).toEqual([
      'due-soon: audit of 2026-10-20T00:00:00.000Z is not within 7 days before approval',
      'overdue: source fingerprint changed since the batch was proposed',
    ]);
  });

  it('refuses a batch that is already decided', () => {
    const { audited, batches } = propose([dueSoon], [audit(dueSoon, 'unchanged')]);
    const decision = { approvedBy: 'Daniel Alkurdi', approvedAt: '2026-11-02T00:00:00.000Z', attestationUrl: CARD };
    const once = approveReconfirmBatch(audited, { batches }, batches[0].id, decision);
    expect(() => approveReconfirmBatch(once.policies, once.ledger, batches[0].id, decision)).toThrow(/already decided/);
  });

  it('flags a record waiting in two open batches', () => {
    const entry = { policyId: 'due-soon', title: 'x', verifiedAt: NOW.toISOString(), verifiedBy: 'D', contentHash: HASH, auditedAt: NOW.toISOString() };
    const ledger = {
      batches: [
        { id: 'b1', proposedAt: NOW.toISOString(), proposedBy: 'x', entries: [entry] },
        { id: 'b2', proposedAt: NOW.toISOString(), proposedBy: 'x', entries: [entry] },
      ],
    };
    expect(validateReconfirmLedger(ledger, [dueSoon]).errors).toEqual([
      'reconfirmations:b2: due-soon is also waiting in batch b1',
    ]);
  });
});
