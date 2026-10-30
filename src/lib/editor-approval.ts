import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { readJsonFile } from '@/lib/file-store';
import {
  APPROVAL_MAILBOX_BRANCH,
  APPROVAL_MAILBOX_PATH,
  APPROVAL_ORIGIN,
  APPROVAL_RP_ID,
  EDITOR_PASSKEYS_PATH,
  type EditorApproval,
  type EditorPasskey,
} from '@/lib/approval-subject';

export * from '@/lib/approval-subject';

/** The WebAuthn challenge for a subject: base64url SHA-256 of its text. */
export function approvalChallenge(subject: string): string {
  return createHash('sha256').update(subject).digest('base64url');
}

export async function readEditorPasskeys(
  root = process.cwd(),
): Promise<EditorPasskey[]> {
  return readJsonFile<EditorPasskey[]>(path.join(root, EDITOR_PASSKEYS_PATH), []);
}

export type ApprovalVerification =
  | { ok: true; passkey: EditorPasskey }
  | { ok: false; error: string };

export async function verifyEditorApproval(
  approval: EditorApproval,
  passkeys: readonly EditorPasskey[],
  expectedSubject: string,
): Promise<ApprovalVerification> {
  if (approval.subject !== expectedSubject) {
    return { ok: false, error: `the approval is for ${approval.subject}, not ${expectedSubject}` };
  }
  const passkey = passkeys.find(
    (candidate) => candidate.credentialId === approval.response?.id,
  );
  if (!passkey) {
    return { ok: false, error: 'the approval was not signed by a registered editor passkey' };
  }
  const response: AuthenticationResponseJSON = {
    id: passkey.credentialId,
    rawId: passkey.credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      authenticatorData: approval.response.authenticatorData,
      clientDataJSON: approval.response.clientDataJSON,
      signature: approval.response.signature,
      userHandle: approval.response.userHandle,
    },
  };
  try {
    const { verified } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: approvalChallenge(expectedSubject),
      expectedOrigin: APPROVAL_ORIGIN,
      expectedRPID: APPROVAL_RP_ID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: 0,
      },
      requireUserVerification: true,
    });
    return verified
      ? { ok: true, passkey }
      : { ok: false, error: 'the passkey signature does not verify' };
  } catch (error) {
    return {
      ok: false,
      error: `the passkey signature does not verify: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Reads the approvals mailbox branch, where the approve route appends. */
export async function fetchEditorApproval(
  subject: string,
  options: { repo?: string; fetchImpl?: typeof fetch } = {},
): Promise<EditorApproval | null> {
  const repo = options.repo ?? 'l0cka/policai';
  const response = await (options.fetchImpl ?? fetch)(
    `https://api.github.com/repos/${repo}/contents/${APPROVAL_MAILBOX_PATH}?ref=${APPROVAL_MAILBOX_BRANCH}`,
    { headers: { Accept: 'application/vnd.github.raw+json' } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Reading the approvals mailbox failed (${response.status})`);
  }
  const approvals = (await response.json()) as EditorApproval[];
  return approvals.findLast((approval) => approval.subject === subject) ?? null;
}
