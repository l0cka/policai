/**
 * Registers the editor's approval passkey from the JSON that
 * policai.org/approve/register produced, once. validate:data refuses any
 * later change to data/editor-passkeys.json.
 *
 * Usage:
 *   npm run passkey:add -- --reviewer="Daniel Alkurdi" --label="iCloud Keychain" '<json from the setup page>'
 */

import path from 'node:path';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import {
  APPROVAL_ORIGIN,
  APPROVAL_RP_ID,
  EDITOR_PASSKEYS_PATH,
  PASSKEY_SETUP_CHALLENGE,
  type EditorPasskey,
} from '../src/lib/editor-approval';

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const args = process.argv.slice(2);
  const reviewer = flag(args, 'reviewer');
  const label = flag(args, 'label') ?? 'editor passkey';
  const json = args.find((arg) => !arg.startsWith('--'));
  if (!reviewer || !json) throw new Error('usage: passkey:add --reviewer=<name> [--label=<text>] <setup json>');

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response: JSON.parse(json) as RegistrationResponseJSON,
    expectedChallenge: PASSKEY_SETUP_CHALLENGE,
    expectedOrigin: APPROVAL_ORIGIN,
    expectedRPID: APPROVAL_RP_ID,
    requireUserVerification: true,
  });
  if (!verified || !registrationInfo) throw new Error('The setup response does not verify');

  const { credential } = registrationInfo;
  const file = path.join(process.cwd(), EDITOR_PASSKEYS_PATH);
  await withDataMutationLock(async () => {
    const passkeys = await readJsonFile<EditorPasskey[]>(file, []);
    if (passkeys.some((passkey) => passkey.credentialId === credential.id)) {
      console.log('passkey:add: this passkey is already registered');
      return;
    }
    passkeys.push({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      reviewer,
      label,
      registeredAt: new Date().toISOString(),
    });
    await writeJsonFile(file, passkeys);
    console.log(`passkey:add: registered ${label} for ${reviewer}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
