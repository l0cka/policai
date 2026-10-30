/**
 * An editor approves by signing a subject with a passkey registered for
 * policai.org. The subject names exactly what was approved, so a signature
 * cannot be moved to another proposal, and only the editor's authenticator
 * can produce one. Agents hold every other credential in the pipeline.
 */
export const APPROVAL_RP_ID = 'policai.org';
export const APPROVAL_ORIGIN = 'https://policai.org';
export const APPROVAL_MAILBOX_BRANCH = 'editor-approvals';
export const APPROVAL_MAILBOX_PATH = 'data/editor-approvals.json';
export const EDITOR_PASSKEYS_PATH = 'data/editor-passkeys.json';
/**
 * Base64url "policai-editor-passkey-setup". The setup challenge proves
 * nothing on its own: a key is trusted because the editor hands it over
 * themselves, once, and the registry then cannot change.
 */
export const PASSKEY_SETUP_CHALLENGE = 'cG9saWNhaS1lZGl0b3ItcGFzc2tleS1zZXR1cA';

export interface EditorPasskey {
  /** Base64url credential id. */
  credentialId: string;
  /** Base64url COSE public key. */
  publicKey: string;
  /** The editor this key signs for; becomes the decision's decidedBy. */
  reviewer: string;
  label: string;
  registeredAt: string;
}

export interface EditorApproval {
  subject: string;
  /** When the approve route received the signature. Not itself signed. */
  receivedAt: string;
  response: {
    id: string;
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
}

export type ApprovalSubject =
  | { kind: 'source-review'; id: string; proposalHash: string }
  | { kind: 'reconfirm'; batchId: string; entriesHash: string };

const SUBJECT_ID = '[A-Za-z0-9._-]{1,200}';
const SUBJECT_PATTERN = new RegExp(
  `^(source-review|reconfirm):(${SUBJECT_ID}):([a-f0-9]{64})$`,
);

export function approvalSubject(subject: ApprovalSubject): string {
  return subject.kind === 'source-review'
    ? `source-review:${subject.id}:${subject.proposalHash}`
    : `reconfirm:${subject.batchId}:${subject.entriesHash}`;
}

export function parseApprovalSubject(text: string): ApprovalSubject | null {
  const match = SUBJECT_PATTERN.exec(text);
  if (!match) return null;
  const [, kind, id, hash] = match;
  return kind === 'source-review'
    ? { kind, id, proposalHash: hash }
    : { kind: 'reconfirm', batchId: id, entriesHash: hash };
}

export function approvalPageUrl(subject: string): string {
  return `${APPROVAL_ORIGIN}/approve?subject=${encodeURIComponent(subject)}`;
}
