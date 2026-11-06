import { createHash } from 'node:crypto';
import { approvalSubject, type EditorApproval } from '@/lib/approval-subject';
import {
  approvalPageUrl,
  fetchEditorApproval,
  verifyEditorApproval,
  type EditorPasskey,
} from '@/lib/editor-approval';
import {
  applyRegisterAuditEvidence,
  auditRegister,
  type RegisterAuditResult,
} from '@/lib/register-audit';
import { buildRecordReviewSchedule, type ReviewableRecord } from '@/lib/coverage-report';

/**
 * Batch re-confirmation of editorially verified records (register policies,
 * timeline events and developments) whose official source has not changed
 * since an editor last verified them.
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

/** The kinds of record a batch can renew. A batch holds one kind. */
export const RECONFIRM_KINDS = ['policy', 'timeline', 'development'] as const;
export type ReconfirmKind = (typeof RECONFIRM_KINDS)[number];

const KIND_LABEL: Record<ReconfirmKind, string> = {
  policy: 'policy',
  timeline: 'timeline event',
  development: 'development',
};

interface ReconfirmEntryFields {
  title: string;
  /** The editorial verification this batch renews. */
  verifiedAt: string;
  verifiedBy: string;
  contentHash: string;
  /** When the register audit found the source unchanged. */
  auditedAt: string;
}

/**
 * The key that names an entry's record also names its kind. The key is part
 * of the signed entries, so a signature cannot be moved to a record of
 * another kind, and policy entries keep the shape they were signed with
 * before other kinds existed.
 */
type EntryRecordKey = { policyId: string } | { timelineEventId: string } | { developmentId: string };

export type ReconfirmEntry = EntryRecordKey & ReconfirmEntryFields;

function entryRecordKey(kind: ReconfirmKind, id: string): EntryRecordKey {
  switch (kind) {
    case 'policy':
      return { policyId: id };
    case 'timeline':
      return { timelineEventId: id };
    case 'development':
      return { developmentId: id };
  }
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
  id: string;
  title: string;
  reason: string;
}

/** The record an entry names, or null for an entry that names none. */
export function entryRecord(entry: ReconfirmEntry): { kind: ReconfirmKind; id: string } | null {
  if ('policyId' in entry) return { kind: 'policy', id: entry.policyId };
  if ('timelineEventId' in entry) return { kind: 'timeline', id: entry.timelineEventId };
  if ('developmentId' in entry) return { kind: 'development', id: entry.developmentId };
  return null;
}

/** The one kind of record every entry in the batch names, or null. */
export function reconfirmBatchKind(batch: Pick<ReconfirmBatch, 'entries'>): ReconfirmKind | null {
  const kinds = new Set(batch.entries.map((entry) => entryRecord(entry)?.kind ?? null));
  const [kind] = kinds;
  return kinds.size === 1 && kind ? kind : null;
}

function openBatchRecordIds(ledger: ReconfirmLedger, kind: ReconfirmKind): Set<string> {
  return new Set(
    ledger.batches
      .filter((batch) => !batch.decision)
      .flatMap((batch) => batch.entries.map(entryRecord))
      .flatMap((record) => (record?.kind === kind ? [record.id] : [])),
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
 * Records of one kind due for editorial review within `dueWithinDays`
 * (overdue included) that could be re-confirmed: verified by a named editor
 * against a stored fingerprint, and not already waiting in an open batch.
 */
export function selectReconfirmCandidates<T extends ReviewableRecord>(
  records: readonly T[],
  ledger: ReconfirmLedger,
  {
    kind,
    now,
    dueWithinDays = RECONFIRM_DUE_WITHIN_DAYS,
    excludeIds = new Set<string>(),
  }: { kind: ReconfirmKind; now: Date; dueWithinDays?: number; excludeIds?: ReadonlySet<string> },
): T[] {
  const waiting = openBatchRecordIds(ledger, kind);
  const due = new Set(
    buildRecordReviewSchedule(records, now)
      .filter((row) => row.daysLeft !== null && row.daysLeft <= dueWithinDays)
      .map((row) => row.id),
  );
  return records.filter(
    (record) =>
      due.has(record.id) &&
      !waiting.has(record.id) &&
      !excludeIds.has(record.id) &&
      record.verification.status === 'verified' &&
      record.verification.method === 'manual' &&
      Boolean(record.verification.checkedAt) &&
      Boolean(record.verification.checkedBy?.trim()) &&
      Boolean(record.verification.source.contentHash),
  );
}

/**
 * Splits audited candidates of one kind into batches of unchanged records and
 * a list for full review. `records` must already carry the audit evidence, so
 * a record the audit marked stale is never batched. An audit result names any
 * record by its id in `policyId`.
 */
export function proposeReconfirmBatches(
  candidates: readonly ReviewableRecord[],
  audits: readonly RegisterAuditResult[],
  records: readonly ReviewableRecord[],
  ledger: ReconfirmLedger,
  { kind, now, batchSize = RECONFIRM_BATCH_SIZE }: { kind: ReconfirmKind; now: Date; batchSize?: number },
): { batches: ReconfirmBatch[]; fullReview: FullReviewItem[] } {
  const auditById = new Map(audits.map((audit) => [audit.policyId, audit]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const entries: ReconfirmEntry[] = [];
  const fullReview: FullReviewItem[] = [];

  for (const candidate of candidates) {
    const audit = auditById.get(candidate.id);
    const record = recordById.get(candidate.id) ?? candidate;
    const { verification } = record;
    if (
      audit?.status === 'unchanged' &&
      verification.status === 'verified' &&
      verification.source.contentHash === candidate.verification.source.contentHash
    ) {
      // The id key comes first, so policy entries keep their signed shape.
      entries.push({
        ...entryRecordKey(kind, record.id),
        title: record.title,
        verifiedAt: verification.checkedAt!,
        verifiedBy: verification.checkedBy!,
        contentHash: verification.source.contentHash!,
        auditedAt: audit.checkedAt,
      });
    } else {
      fullReview.push({
        id: candidate.id,
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

/**
 * `propose` end to end for one kind: selects the due candidates, audits
 * their official sources, and batches the unchanged ones. Returns `records`
 * with the audit evidence applied (a changed source marks its record stale);
 * the audit touches only `verification`, so every other field is kept.
 */
export async function proposeReconfirmation<T extends ReviewableRecord>(
  records: readonly T[],
  ledger: ReconfirmLedger,
  options: {
    kind: ReconfirmKind;
    now: Date;
    sourceUrl: (record: T) => string;
    dueWithinDays?: number;
    batchSize?: number;
    excludeIds?: ReadonlySet<string>;
    audit?: Parameters<typeof auditRegister>[1];
  },
): Promise<{ candidates: T[]; records: T[]; batches: ReconfirmBatch[]; fullReview: FullReviewItem[] }> {
  const candidates = selectReconfirmCandidates(records, ledger, options);
  const views = candidates.map((record) => ({ ...record, sourceUrl: options.sourceUrl(record) }));
  const audits = await auditRegister(views, options.audit);
  const auditedById = new Map(
    applyRegisterAuditEvidence(views, audits).map((view) => [view.id, view.verification]),
  );
  const audited = records.map((record): T => {
    const verification = auditedById.get(record.id);
    return verification ? { ...record, verification } : record;
  });
  return {
    candidates,
    records: audited,
    ...proposeReconfirmBatches(candidates, audits, audited, ledger, options),
  };
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
 * The editor's decision on a batch, read from the approvals mailbox. Refuses
 * a batch the editor has not signed, and a signature that does not verify
 * against a registered passkey for exactly this batch's entries.
 */
export async function reconfirmPasskeyDecision(
  batch: ReconfirmBatch,
  passkeys: readonly EditorPasskey[],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<ReconfirmDecision> {
  const subject = reconfirmApprovalSubject(batch);
  const approval = await fetchEditorApproval(subject, options);
  if (!approval) {
    throw new ReconfirmError([
      `the editor has not approved batch ${batch.id} with their passkey; send them ${approvalPageUrl(subject)}`,
    ]);
  }
  const verified = await verifyEditorApproval(approval, passkeys, subject);
  if (!verified.ok) throw new ReconfirmError([verified.error]);
  return { approvedBy: verified.passkey.reviewer, approvedAt: approval.receivedAt, approval };
}

/**
 * Renews editorial verification for every record in an approved batch, or
 * for none of them. `records` are the batch's kind (`reconfirmBatchKind`).
 * Each record must still be verified on the fingerprint the batch was
 * proposed on, and its audit must be at most RECONFIRM_AUDIT_MAX_AGE_DAYS
 * older than the approval.
 */
export function approveReconfirmBatch<T extends ReviewableRecord>(
  records: readonly T[],
  ledger: ReconfirmLedger,
  batchId: string,
  decision: ReconfirmDecision,
): { records: T[]; ledger: ReconfirmLedger } {
  const batch = ledger.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new ReconfirmError([`unknown batch ${batchId}`]);
  const kind = reconfirmBatchKind(batch);
  if (!kind) throw new ReconfirmError([`batch ${batchId} does not name records of one kind`]);

  const problems: string[] = [];
  if (batch.decision) problems.push(`batch ${batchId} is already decided`);
  if (!decision.approvedBy.trim()) problems.push('approvedBy is empty');
  problems.push(...decisionAttestationProblems(batch, decision));
  const approvedTime = Date.parse(decision.approvedAt);
  if (Number.isNaN(approvedTime)) problems.push('approvedAt is not a timestamp');

  const recordById = new Map(records.map((record) => [record.id, record]));
  const entryById = new Map<string, ReconfirmEntry>();
  for (const entry of batch.entries) {
    const id = entryRecord(entry)!.id;
    entryById.set(id, entry);
    const record = recordById.get(id);
    if (!record) {
      problems.push(`${id}: no such ${KIND_LABEL[kind]}`);
      continue;
    }
    const { verification } = record;
    if (verification.status !== 'verified')
      problems.push(`${id}: verification is ${verification.status}`);
    if (verification.source.contentHash !== entry.contentHash)
      problems.push(`${id}: source fingerprint changed since the batch was proposed`);
    if (verification.checkedAt !== entry.verifiedAt)
      problems.push(`${id}: re-verified since the batch was proposed`);
    const auditAge = approvedTime - Date.parse(entry.auditedAt);
    if (!(auditAge >= 0 && auditAge <= RECONFIRM_AUDIT_MAX_AGE_DAYS * DAY_MS))
      problems.push(
        `${id}: audit of ${entry.auditedAt} is not within ${RECONFIRM_AUDIT_MAX_AGE_DAYS} days before approval`,
      );
  }
  if (problems.length > 0) throw new ReconfirmError(problems);

  const renewed = records.map((record): T => {
    const entry = entryById.get(record.id);
    if (!entry) return record;
    const priorNotes = (record.verification.notes ?? '').split(NOTE_MARKER)[0];
    const note = `${NOTE_MARKER}${batch.id} by ${decision.approvedBy} on ${day(decision.approvedAt)} (${decision.approval ? 'passkey approval' : decision.attestationUrl}): the source fingerprint was unchanged at the ${day(entry.auditedAt)} register audit, matching the version verified on ${day(entry.verifiedAt)}.`;
    return {
      ...record,
      // Only register policies carry a separate review stamp.
      ...(kind === 'policy' ? { lastReviewedAt: decision.approvedAt } : {}),
      verification: {
        ...record.verification,
        checkedAt: decision.approvedAt,
        checkedBy: decision.approvedBy,
        notes: `${priorNotes}${note}`.trim(),
      },
    };
  });

  return {
    records: renewed,
    ledger: {
      batches: ledger.batches.map((candidate) =>
        candidate.id === batchId ? { ...candidate, decision } : candidate,
      ),
    },
  };
}

export function validateReconfirmLedger(
  ledger: ReconfirmLedger | null,
  records: Partial<Record<ReconfirmKind, readonly { id: string }[]>>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!ledger) return { errors, warnings };
  if (!Array.isArray(ledger.batches)) {
    errors.push('reconfirmations: batches must be an array');
    return { errors, warnings };
  }

  const idsByKind = new Map(
    RECONFIRM_KINDS.map((kind) => [kind, new Set((records[kind] ?? []).map((record) => record.id))]),
  );
  const batchIds = new Set<string>();
  const waiting = new Map<string, string>();
  for (const batch of ledger.batches) {
    const label = `reconfirmations:${batch.id}`;
    if (batchIds.has(batch.id)) errors.push(`${label}: duplicate batch id`);
    batchIds.add(batch.id);
    if (!Array.isArray(batch.entries) || batch.entries.length === 0) {
      errors.push(`${label}: a batch needs at least one entry`);
      continue;
    }
    if (!reconfirmBatchKind(batch))
      errors.push(`${label}: every entry must name a policyId, timelineEventId or developmentId, all of one kind`);
    for (const entry of batch.entries) {
      const record = entryRecord(entry);
      if (!record) continue;
      if (!idsByKind.get(record.kind)!.has(record.id))
        errors.push(`${label}: unknown ${KIND_LABEL[record.kind]} ${record.id}`);
      if (!/^[0-9a-f]{64}$/.test(entry.contentHash ?? ''))
        errors.push(`${label}:${record.id}: contentHash must be a SHA-256 hex digest`);
      if (!batch.decision) {
        const key = `${record.kind}:${record.id}`;
        const other = waiting.get(key);
        if (other)
          errors.push(`${label}: ${record.id} is also waiting in batch ${other}`);
        waiting.set(key, batch.id);
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
