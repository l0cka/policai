import { createHash } from 'node:crypto';
import { approvalSubject, type EditorApproval } from '@/lib/approval-subject';
import type { RegisterAuditResult } from '@/lib/register-audit';
import { buildRecordReviewSchedule } from '@/lib/coverage-report';
import type { Policy } from '@/types';

/**
 * Batch re-confirmation of register records whose official source has not
 * changed since an editor last verified them.
 *
 * `proposeReconfirmBatches` groups records that are due for review and that a
 * fresh register audit found unchanged. The editor approves a whole batch on
 * one passkey signature; `approveReconfirmBatch` then renews each record's
 * editorial verification, provided its fingerprint still matches the one the
 * batch was proposed on and the audit is recent. Changed or unreadable sources
 * never enter a batch; they need a full review.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RECONFIRM_BATCH_SIZE = 10;
export const RECONFIRM_DUE_WITHIN_DAYS = 30;
/** Same bound as blocked-host evidence in the source approval flow. */
export const RECONFIRM_AUDIT_MAX_AGE_DAYS = 7;
export const RECONFIRM_PROPOSED_BY = 'Claude (agent)';
const NOTE_MARKER = ' Re-confirmed in batch ';

export interface ReconfirmEntry {
  policyId: string;
  title: string;
  /** The editorial verification this batch renews. */
  verifiedAt: string;
  verifiedBy: string;
  contentHash: string;
  /** When the register audit found the source unchanged. */
  auditedAt: string;
}

export interface ReconfirmDecision {
  approvedBy: string;
  approvedAt: string;
  /** The editor's passkey signature over `reconfirmApprovalSubject(batch)`. */
  approval?: EditorApproval;
  /** Decisions made before an editor passkey was registered: the card link. */
  attestationUrl?: string;
}

export interface ReconfirmBatch {
  id: string;
  proposedAt: string;
  proposedBy: string;
  entries: ReconfirmEntry[];
  decision?: ReconfirmDecision;
}

export interface ReconfirmLedger {
  batches: ReconfirmBatch[];
}

export interface FullReviewItem {
  policyId: string;
  title: string;
  reason: string;
}

function openBatchPolicyIds(ledger: ReconfirmLedger): Set<string> {
  return new Set(
    ledger.batches
      .filter((batch) => !batch.decision)
      .flatMap((batch) => batch.entries.map((entry) => entry.policyId)),
  );
}

/** What the editor signs to approve a batch: its id and exact entries. */
export function reconfirmApprovalSubject(batch: Pick<ReconfirmBatch, 'id' | 'entries'>): string {
  return approvalSubject({
    kind: 'reconfirm',
    batchId: batch.id,
    entriesHash: createHash('sha256').update(JSON.stringify(batch.entries)).digest('hex'),
  });
}

function decisionAttestationProblems(batch: ReconfirmBatch, decision: ReconfirmDecision): string[] {
  if (decision.approval) {
    return decision.approval.subject === reconfirmApprovalSubject(batch)
      ? []
      : ['the passkey approval is for a different batch or different entries'];
  }
  return /^https:\/\//.test(decision.attestationUrl ?? '')
    ? []
    : ['decision needs a passkey approval or an https attestationUrl'];
}

/**
 * Records due for editorial review within `dueWithinDays` (overdue included)
 * that could be re-confirmed: verified by a named editor against a stored
 * fingerprint, and not already waiting in an open batch.
 */
export function selectReconfirmCandidates(
  policies: readonly Policy[],
  ledger: ReconfirmLedger,
  {
    now,
    dueWithinDays = RECONFIRM_DUE_WITHIN_DAYS,
    excludeIds = new Set<string>(),
  }: { now: Date; dueWithinDays?: number; excludeIds?: ReadonlySet<string> },
): Policy[] {
  const waiting = openBatchPolicyIds(ledger);
  const due = new Set(
    buildRecordReviewSchedule(policies, now)
      .filter((row) => row.daysLeft !== null && row.daysLeft <= dueWithinDays)
      .map((row) => row.id),
  );
  return policies.filter(
    (policy) =>
      due.has(policy.id) &&
      !waiting.has(policy.id) &&
      !excludeIds.has(policy.id) &&
      policy.verification.status === 'verified' &&
      policy.verification.method === 'manual' &&
      Boolean(policy.verification.checkedAt) &&
      Boolean(policy.verification.checkedBy?.trim()) &&
      Boolean(policy.verification.source.contentHash),
  );
}

/**
 * Splits audited candidates into batches of unchanged records and a list for
 * full review. `policies` must already carry the audit evidence, so a record
 * the audit marked stale is never batched.
 */
export function proposeReconfirmBatches(
  candidates: readonly Policy[],
  audits: readonly RegisterAuditResult[],
  policies: readonly Policy[],
  ledger: ReconfirmLedger,
  { now, batchSize = RECONFIRM_BATCH_SIZE }: { now: Date; batchSize?: number },
): { batches: ReconfirmBatch[]; fullReview: FullReviewItem[] } {
  const auditById = new Map(audits.map((audit) => [audit.policyId, audit]));
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));
  const entries: ReconfirmEntry[] = [];
  const fullReview: FullReviewItem[] = [];

  for (const candidate of candidates) {
    const audit = auditById.get(candidate.id);
    const policy = policyById.get(candidate.id) ?? candidate;
    const { verification } = policy;
    if (
      audit?.status === 'unchanged' &&
      verification.status === 'verified' &&
      verification.source.contentHash === candidate.verification.source.contentHash
    ) {
      entries.push({
        policyId: policy.id,
        title: policy.title,
        verifiedAt: verification.checkedAt!,
        verifiedBy: verification.checkedBy!,
        contentHash: verification.source.contentHash!,
        auditedAt: audit.checkedAt,
      });
    } else {
      fullReview.push({
        policyId: candidate.id,
        title: candidate.title,
        reason: audit
          ? `${audit.status}${audit.error ? `: ${audit.error}` : ''}`
          : 'not audited',
      });
    }
  }

  const day = now.toISOString().slice(0, 10);
  const taken = new Set(ledger.batches.map((batch) => batch.id));
  let sequence = 1;
  const nextId = () => {
    while (taken.has(`${day}-${sequence}`)) sequence += 1;
    const id = `${day}-${sequence}`;
    taken.add(id);
    return id;
  };

  const batches: ReconfirmBatch[] = [];
  for (let start = 0; start < entries.length; start += batchSize) {
    batches.push({
      id: nextId(),
      proposedAt: now.toISOString(),
      proposedBy: RECONFIRM_PROPOSED_BY,
      entries: entries.slice(start, start + batchSize),
    });
  }
  return { batches, fullReview };
}

export class ReconfirmError extends Error {
  constructor(readonly problems: string[]) {
    super(`Batch cannot be approved:\n- ${problems.join('\n- ')}`);
  }
}

function day(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Renews editorial verification for every record in an approved batch, or
 * for none of them. Each record must still be verified on the fingerprint the
 * batch was proposed on, and its audit must be at most
 * RECONFIRM_AUDIT_MAX_AGE_DAYS older than the approval.
 */
export function approveReconfirmBatch(
  policies: readonly Policy[],
  ledger: ReconfirmLedger,
  batchId: string,
  decision: ReconfirmDecision,
): { policies: Policy[]; ledger: ReconfirmLedger } {
  const batch = ledger.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new ReconfirmError([`unknown batch ${batchId}`]);

  const problems: string[] = [];
  if (batch.decision) problems.push(`batch ${batchId} is already decided`);
  if (!decision.approvedBy.trim()) problems.push('approvedBy is empty');
  problems.push(...decisionAttestationProblems(batch, decision));
  const approvedTime = Date.parse(decision.approvedAt);
  if (Number.isNaN(approvedTime)) problems.push('approvedAt is not a timestamp');

  const policyById = new Map(policies.map((policy) => [policy.id, policy]));
  for (const entry of batch.entries) {
    const policy = policyById.get(entry.policyId);
    if (!policy) {
      problems.push(`${entry.policyId}: no longer in the register`);
      continue;
    }
    const { verification } = policy;
    if (verification.status !== 'verified')
      problems.push(`${entry.policyId}: verification is ${verification.status}`);
    if (verification.source.contentHash !== entry.contentHash)
      problems.push(`${entry.policyId}: source fingerprint changed since the batch was proposed`);
    if (verification.checkedAt !== entry.verifiedAt)
      problems.push(`${entry.policyId}: re-verified since the batch was proposed`);
    const auditAge = approvedTime - Date.parse(entry.auditedAt);
    if (!(auditAge >= 0 && auditAge <= RECONFIRM_AUDIT_MAX_AGE_DAYS * DAY_MS))
      problems.push(
        `${entry.policyId}: audit of ${entry.auditedAt} is not within ${RECONFIRM_AUDIT_MAX_AGE_DAYS} days before approval`,
      );
  }
  if (problems.length > 0) throw new ReconfirmError(problems);

  const entryById = new Map(batch.entries.map((entry) => [entry.policyId, entry]));
  const renewed = policies.map((policy): Policy => {
    const entry = entryById.get(policy.id);
    if (!entry) return policy;
    const priorNotes = (policy.verification.notes ?? '').split(NOTE_MARKER)[0];
    const note = `${NOTE_MARKER}${batch.id} by ${decision.approvedBy} on ${day(decision.approvedAt)} (${decision.approval ? 'passkey approval' : decision.attestationUrl}): the source fingerprint was unchanged at the ${day(entry.auditedAt)} register audit, matching the version verified on ${day(entry.verifiedAt)}.`;
    return {
      ...policy,
      lastReviewedAt: decision.approvedAt,
      verification: {
        ...policy.verification,
        checkedAt: decision.approvedAt,
        checkedBy: decision.approvedBy,
        notes: `${priorNotes}${note}`.trim(),
      },
    };
  });

  return {
    policies: renewed,
    ledger: {
      batches: ledger.batches.map((candidate) =>
        candidate.id === batchId ? { ...candidate, decision } : candidate,
      ),
    },
  };
}

export function validateReconfirmLedger(
  ledger: ReconfirmLedger | null,
  policies: readonly Pick<Policy, 'id'>[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!ledger) return { errors, warnings };
  if (!Array.isArray(ledger.batches)) {
    errors.push('reconfirmations: batches must be an array');
    return { errors, warnings };
  }

  const policyIds = new Set(policies.map((policy) => policy.id));
  const batchIds = new Set<string>();
  const waiting = new Map<string, string>();
  for (const batch of ledger.batches) {
    const label = `reconfirmations:${batch.id}`;
    if (batchIds.has(batch.id)) errors.push(`${label}: duplicate batch id`);
    batchIds.add(batch.id);
    if (!Array.isArray(batch.entries) || batch.entries.length === 0)
      errors.push(`${label}: a batch needs at least one entry`);
    for (const entry of batch.entries ?? []) {
      if (!policyIds.has(entry.policyId))
        errors.push(`${label}: unknown policy ${entry.policyId}`);
      if (!/^[0-9a-f]{64}$/.test(entry.contentHash ?? ''))
        errors.push(`${label}:${entry.policyId}: contentHash must be a SHA-256 hex digest`);
      if (!batch.decision) {
        const other = waiting.get(entry.policyId);
        if (other)
          errors.push(`${label}: ${entry.policyId} is also waiting in batch ${other}`);
        waiting.set(entry.policyId, batch.id);
      }
    }
    if (batch.decision) {
      if (!batch.decision.approvedBy?.trim())
        errors.push(`${label}: decision needs approvedBy`);
      if (Number.isNaN(Date.parse(batch.decision.approvedAt ?? '')))
        errors.push(`${label}: decision needs an approvedAt timestamp`);
      for (const problem of decisionAttestationProblems(batch, batch.decision))
        errors.push(`${label}: ${problem}`);
    }
  }
  const open = ledger.batches.filter((batch) => !batch.decision).length;
  if (open > 0)
    warnings.push(`reconfirmations: ${open} batch(es) await an editorial decision`);
  return { errors, warnings };
}
