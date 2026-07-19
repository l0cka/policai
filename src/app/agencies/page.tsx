import type { Metadata } from 'next';
import { AgenciesBrowser } from '@/components/agencies-browser';
import { getCommonwealthAgencies } from '@/lib/data-service';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Agency AI Transparency Statements — Policai',
  description:
    'Browse Australian Government agency AI transparency statements and public disclosures.',
};

export default async function AgenciesPage() {
  const agencies = await getCommonwealthAgencies();
  return <AgenciesBrowser agencies={agencies} />;
}
