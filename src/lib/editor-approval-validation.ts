import {
  approvalSubject,
  verifyEditorApproval,
  type EditorApproval,
  type EditorPasskey,
} from '@/lib/editor-approval';
import { reconfirmApprovalSubject, type ReconfirmBatch } from '@/lib/register-reconfirm';
import { batchCovers, sourceReviewBatchSubject } from '@/lib/source-review-batch';
import type { SourceReview } from '@/types';

export interface EditorApprovalState {
  passkeys: EditorPasskey[];
  sourceReviews: SourceReview[];
  reconfirmBatches: ReconfirmBatch[];
}

interface Decision {
  label: string;
  key: string;
  subject: string;
  decidedBy: string;
  decidedAt: string;
  approval?: EditorApproval;
  /** Why the decision's own record contradicts what it claims was signed. */
  problem?: string;
}

function decisions(state: Omit<EditorApprovalState, 'passkeys'>): Decision[] {
  const fromReviews = state.sourceReviews.flatMap((review): Decision[] =>
    review.decision
      ? [{
          label: `sourceReviews:${review.id}`,
          key: `source-review:${review.id}:${review.decision.proposalHash}`,
          subject: review.decision.batch
            ? sourceReviewBatchSubject(review.decision.batch)
            : approvalSubject({ kind: 'source-review', id: review.id, proposalHash: review.decision.proposalHash }),
          decidedBy: review.decision.decidedBy,
          decidedAt: review.decision.decidedAt,
          approval: review.decision.approval,
          problem:
            review.decision.batch &&
            !batchCovers(review.decision.batch, { id: review.id, proposalHash: review.decision.proposalHash })
              ? `batch ${review.decision.batch.id} does not include this proposal`
              : undefined,
        }]
      : [],
  );
  const fromBatches = state.reconfirmBatches.flatMap((batch): Decision[] =>
    batch.decision
      ? [{
          label: `reconfirmations:${batch.id}`,
          key: `reconfirm:${batch.id}`,
          subject: reconfirmApprovalSubject(batch),
          decidedBy: batch.decision.approvedBy,
          decidedAt: batch.decision.approvedAt,
          approval: batch.decision.approval,
        }]
      : [],
  );
  return [...fromReviews, ...fromBatches];
}

/**
 * Publication's last gate, run in CI on every pull request. Once an editor
 * passkey is registered, every decision made after its registration, and
 * every decision new on the branch, must carry that editor's signature over
 * exactly what it approved. The registry itself cannot change once it holds
 * a key, so an agent cannot enrol its own.
 */
export async function validateEditorApprovals(
  head: EditorApprovalState,
  base: EditorApprovalState | null,
): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];

  if (base && base.passkeys.length > 0 && JSON.stringify(base.passkeys) !== JSON.stringify(head.passkeys)) {
    errors.push(
      'editor-passkeys: the registry changed after an editor passkey was registered; keys cannot be added, removed or edited by a pull request',
    );
  }
  for (const passkey of head.passkeys) {
    if (!passkey.credentialId || !passkey.publicKey || !passkey.reviewer?.trim() || Number.isNaN(Date.parse(passkey.registeredAt))) {
      errors.push(`editor-passkeys:${passkey.credentialId || '?'}: needs credentialId, publicKey, reviewer and registeredAt`);
    }
  }

  const since = Math.min(...head.passkeys.map((passkey) => Date.parse(passkey.registeredAt)));
  const baseKeys = new Set(base ? decisions(base).map((decision) => decision.key) : []);
  for (const decision of decisions(head)) {
    if (decision.problem) errors.push(`${decision.label}: ${decision.problem}`);
    const required =
      head.passkeys.length > 0 &&
      (Date.parse(decision.decidedAt) >= since || (base !== null && !baseKeys.has(decision.key)));
    if (!decision.approval) {
      if (required) errors.push(`${decision.label}: decided without the editor's passkey approval`);
      continue;
    }
    const verified = await verifyEditorApproval(decision.approval, head.passkeys, decision.subject);
    if (!verified.ok) {
      errors.push(`${decision.label}: ${verified.error}`);
    } else if (verified.passkey.reviewer !== decision.decidedBy) {
      errors.push(`${decision.label}: decided by ${decision.decidedBy}, but the passkey belongs to ${verified.passkey.reviewer}`);
    }
  }
  return { errors, warnings: [] };
}
