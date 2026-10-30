import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageIntro } from '@/components/layout';
import { ApproveWithPasskey } from '@/components/approve/approve-with-passkey';

export const metadata: Metadata = {
  title: 'Approve',
  robots: { index: false, follow: false },
};

export default function ApprovePage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Approve"
        eyebrow="Editor · decision"
        description="Sign this decision with your passkey. Publishing checks the signature, so nothing publishes without it."
      />
      <Suspense>
        <ApproveWithPasskey />
      </Suspense>
    </div>
  );
}
