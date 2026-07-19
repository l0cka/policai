import type { Metadata } from 'next';
import { CourtsBrowser } from '@/components/courts-browser';
import { getPolicies } from '@/lib/data-service';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Courts & Tribunals — Policai',
  description:
    'Verified Australian court practice notes, directions, and guidance governing the use of artificial intelligence in proceedings.',
};

export default async function CourtsPage() {
  const policies = await getPolicies({ type: 'practice_note' });
  return <CourtsBrowser policies={policies} />;
}
