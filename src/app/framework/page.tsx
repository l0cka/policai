import {
  PolicyFrameworkMap,
  type FrameworkData,
} from '@/components/visualizations/PolicyFrameworkMap';
import { getPolicyFrameworkArtifact } from '@/lib/data-service';
import { parseCalendarDateForDisplay } from '@/lib/format-policy-date';
import Link from 'next/link';
import { ExternalLink, FileText, Download } from 'lucide-react';
import { PageIntro } from '@/components/layout';
import { SourceState } from '@/components/policy-table';

export const revalidate = 3600;

export const metadata = {
  title: 'Policy for the Responsible Use of AI in Government | Policai',
  description: 'Interactive visualization of Australia\'s Policy for the Responsible Use of AI in Government',
};

export default async function FrameworkPage() {
  const artifact = await getPolicyFrameworkArtifact();
  if (!artifact) {
    return (
      <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
        <PageIntro title="AI in government framework" />
        <div className="border-l-2 border-[var(--caution)] bg-[var(--status-proposed-bg)]/30 px-4 py-3 text-sm">
          <p className="font-medium">Framework temporarily unavailable</p>
          <p className="mt-2 text-muted-foreground">
            Policai is withholding this derived visualisation while its
            source policy and framework data await fingerprinted editorial
            re-verification. This prevents an older interpretation from
            being presented as current.
          </p>
          <p className="mt-2 text-muted-foreground">
            See the{' '}
            <Link href="/methodology" className="text-primary hover:underline">
              methodology and trust model
            </Link>{' '}
            for how records return to public view.
          </p>
        </div>
      </div>
    );
  }
  const frameworkData = artifact as unknown as FrameworkData;

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro title="AI in government framework" />

      <div className="mb-8 flex flex-wrap items-center gap-1">
        <a
          href={frameworkData.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ExternalLink className="h-4 w-4" />
          View official source
        </a>
        <Link
          href={`/policies/${frameworkData.relatedPolicyId}`}
          className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium hover:text-primary"
        >
          <FileText className="h-4 w-4" />
          Register entry
        </Link>
        <a
          href="https://www.digital.gov.au/sites/default/files/documents/2025-12/Policy%20for%20the%20responsible%20use%20of%20AI%20in%20Government%202.0_0.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium hover:text-primary"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      <PolicyFrameworkMap data={frameworkData} />

      <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-y border-[var(--rule-hair)] py-4">
        <div>
          <p className="page-eyebrow">Effective</p>
          <p className="mt-1 text-sm">
            {parseCalendarDateForDisplay(
              frameworkData.effectiveDate,
            ).toLocaleDateString('en-AU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        {frameworkData.lastUpdated && (
          <div>
            <p className="page-eyebrow">Page updated</p>
            <p className="mt-1 text-sm">
              {parseCalendarDateForDisplay(
                frameworkData.lastUpdated,
              ).toLocaleDateString('en-AU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        )}
        <div>
          <p className="page-eyebrow">Verification</p>
          <p className="mt-1">
            <SourceState verification={frameworkData.verification} />
          </p>
        </div>
      </div>
    </div>
  );
}
