'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { APPROVAL_RP_ID, PASSKEY_SETUP_CHALLENGE } from '@/lib/approval-subject';

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function RegisterPasskey() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function register() {
    setError(null);
    try {
      const credential = await startRegistration({
        optionsJSON: {
          challenge: PASSKEY_SETUP_CHALLENGE,
          rp: { id: APPROVAL_RP_ID, name: 'Policai' },
          user: { id: randomId(), name: 'Policai editor', displayName: 'Policai editor' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          attestation: 'none',
          timeout: 120_000,
        },
      });
      setResult(JSON.stringify(credential));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
  }

  return (
    <section className="space-y-4">
      {result ? (
        <>
          <p className="text-sm">Passkey created. Copy this and paste it into the Policai project chat.</p>
          <textarea
            readOnly
            value={result}
            aria-label="Passkey setup result"
            className="h-40 w-full rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
          />
          <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        </>
      ) : (
        <Button onClick={register}>Create passkey</Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
