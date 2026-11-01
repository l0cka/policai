'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { APPROVAL_RP_ID, parseApprovalSubject, type ApprovalSubject } from '@/lib/approval-subject';

type Status =
  | { state: 'idle' }
  | { state: 'signing' }
  | { state: 'approved'; reviewer: string }
  | { state: 'failed'; error: string };

async function challengeFor(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subject));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function describe(subject: ApprovalSubject) {
  if (subject.kind === 'source-review')
    return { what: 'Publish source review', id: subject.id, code: subject.proposalHash.slice(0, 8) };
  return {
    what: subject.kind === 'reconfirm' ? 'Re-confirm register batch' : 'Publish source review batch',
    id: subject.batchId,
    code: subject.entriesHash.slice(0, 8),
  };
}

export function ApproveWithPasskey() {
  const subject = useSearchParams().get('subject') ?? '';
  const parsed = parseApprovalSubject(subject);
  const [status, setStatus] = useState<Status>({ state: 'idle' });

  if (!parsed) {
    return <p className="text-sm text-muted-foreground">This link does not name anything to approve.</p>;
  }
  const { what, id, code } = describe(parsed);

  async function approve() {
    setStatus({ state: 'signing' });
    try {
      const credential = await startAuthentication({
        optionsJSON: {
          challenge: await challengeFor(subject),
          rpId: APPROVAL_RP_ID,
          userVerification: 'required',
          allowCredentials: [],
          timeout: 120_000,
        },
      });
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, response: { id: credential.id, ...credential.response } }),
      });
      const result = (await response.json()) as { success: boolean; reviewer?: string; error?: string };
      setStatus(
        result.success
          ? { state: 'approved', reviewer: result.reviewer ?? '' }
          : { state: 'failed', error: result.error ?? `The approval was refused (${response.status})` },
      );
    } catch (error) {
      setStatus({ state: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <section className="space-y-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border p-4 text-sm">
        <dt className="text-muted-foreground">Decision</dt>
        <dd>{what}</dd>
        <dt className="text-muted-foreground">Record</dt>
        <dd className="break-all font-mono">{id}</dd>
        <dt className="text-muted-foreground">Proposal code</dt>
        <dd className="font-mono text-base font-semibold">{code}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Check that the proposal code matches the one you were shown. Approving signs this exact proposal; if it changes, you will be asked again.
      </p>
      {status.state === 'approved' ? (
        <p role="status" className="text-sm font-medium">
          Approved by {status.reviewer}. You can close this page.
        </p>
      ) : (
        <Button onClick={approve} disabled={status.state === 'signing'}>
          {status.state === 'signing' ? 'Waiting for your passkey…' : 'Approve with passkey'}
        </Button>
      )}
      {status.state === 'failed' && (
        <p role="alert" className="text-sm text-destructive">
          {status.error}
        </p>
      )}
    </section>
  );
}
