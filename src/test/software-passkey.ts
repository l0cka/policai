import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import {
  APPROVAL_ORIGIN,
  APPROVAL_RP_ID,
  type EditorApproval,
  type EditorPasskey,
} from '@/lib/editor-approval';

/**
 * An ES256 authenticator in process, so tests sign approvals the way a real
 * passkey does: over authenticatorData and the SHA-256 of clientDataJSON.
 */
export function softwarePasskey(reviewer = 'Daniel Alkurdi') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = new Map<number, number | Uint8Array>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x!, 'base64url')],
    [-3, Buffer.from(jwk.y!, 'base64url')],
  ]);
  const passkey: EditorPasskey = {
    credentialId: randomBytes(16).toString('base64url'),
    publicKey: Buffer.from(isoCBOR.encode(cose)).toString('base64url'),
    reviewer,
    label: 'test authenticator',
    registeredAt: '2026-10-30T00:00:00.000Z',
  };

  function approve(
    subject: string,
    options: { origin?: string; userVerified?: boolean; receivedAt?: string } = {},
  ): EditorApproval {
    const rpIdHash = createHash('sha256').update(APPROVAL_RP_ID).digest();
    const flags = Buffer.from([options.userVerified === false ? 0x01 : 0x05]);
    const authenticatorData = Buffer.concat([rpIdHash, flags, Buffer.alloc(4)]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: createHash('sha256').update(subject).digest('base64url'),
        origin: options.origin ?? APPROVAL_ORIGIN,
      }),
    );
    const signed = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientDataJSON).digest(),
    ]);
    return {
      subject,
      receivedAt: options.receivedAt ?? '2026-10-30T01:00:00.000Z',
      response: {
        id: passkey.credentialId,
        authenticatorData: authenticatorData.toString('base64url'),
        clientDataJSON: clientDataJSON.toString('base64url'),
        signature: sign('sha256', signed, privateKey).toString('base64url'),
      },
    };
  }

  return { passkey, approve };
}
