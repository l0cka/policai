import type { Metadata } from 'next';
import { PageIntro } from '@/components/layout';
import { RegisterPasskey } from '@/components/approve/register-passkey';

export const metadata: Metadata = {
  title: 'Set up approval passkey',
  robots: { index: false, follow: false },
};

export default function RegisterPasskeyPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Set up your approval passkey"
        eyebrow="Editor · one-time setup"
        description="Creates the passkey that signs your publishing decisions. Copy the result into the Policai project chat; it goes into the register of editor keys once, and that register then cannot change."
      />
      <RegisterPasskey />
    </div>
  );
}
