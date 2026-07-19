import {
  PolicyFrameworkMap,
  type FrameworkData,
} from '@/components/visualizations/PolicyFrameworkMap';
import { getPolicyFrameworkArtifact } from '@/lib/data-service';
import { parseCalendarDateForDisplay } from '@/lib/format-policy-date';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageIntro } from '@/components/layout';

export const revalidate = 3600;

export const metadata = {
  title: 'Policy for the Responsible Use of AI in Government | Policai',
  description: 'Interactive visualization of Australia\'s Policy for the Responsible Use of AI in Government',
};

export default async function FrameworkPage() {
  const artifact = await getPolicyFrameworkArtifact();
  if (!artifact) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/policies"
            className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Policies
          </Link>
        </div>
        <PageIntro
          title="AI in Government framework"
          description="Explore the structure, obligations and accountability model behind the Australian Government policy for responsible AI use."
        />
        <Card className="rounded-none border-[var(--caution)]/30 bg-[var(--status-proposed-bg)]/25 shadow-none">
          <CardHeader>
            <CardTitle>Framework temporarily unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Policai is withholding this derived visualisation while its
              source policy and framework data await fingerprinted editorial
              re-verification. This prevents an older interpretation from
              being presented as current.
            </p>
            <p>
              See the{' '}
              <Link href="/methodology" className="text-primary hover:underline">
                methodology and trust model
              </Link>{' '}
              for how records return to public view.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const frameworkData = artifact as unknown as FrameworkData;

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/policies"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Policies
        </Link>
      </div>

      <div className="mb-8 space-y-6">
        <PageIntro
          title="AI in Government framework"
          description={
            <p>
              Explore the structure, obligations, and accountability model behind the Australian Government&apos;s policy for responsible AI use.
            </p>
          }
        />

        <Card className="rounded-none border-primary/20 bg-primary/5 shadow-none">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <h2 className="mb-2 text-xl font-semibold">
                  Australian Government AI Policy Visual Map
                </h2>
                <p className="text-sm text-muted-foreground">
                  This interactive visualization breaks down the DTA&apos;s Policy for the Responsible Use of AI
                  in Government (Version 2.0). Click on pillars to explore principles and requirements.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/policies/${frameworkData.relatedPolicyId}`}>
                    <FileText className="mr-2 h-4 w-4" />
                    Register entry
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={frameworkData.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View Original
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://www.digital.gov.au/sites/default/files/documents/2025-12/Policy%20for%20the%20responsible%20use%20of%20AI%20in%20Government%202.0_0.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Framework Visualization */}
      <PolicyFrameworkMap data={frameworkData as FrameworkData} />

      {/* Footer Note */}
      <Card className="mt-10 rounded-none border-border bg-card/35 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">About This Visualization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This visual map represents the structure and requirements of the Australian Government&apos;s
            AI policy as published by the Digital Transformation Agency. The policy applies to all
            non-corporate Commonwealth entities and provides a framework for responsible AI adoption.
            For the authoritative source, please refer to the{' '}
            <a
              href={frameworkData.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              official DTA website
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">Effective:</span>{' '}
              {parseCalendarDateForDisplay(
                frameworkData.effectiveDate,
              ).toLocaleDateString('en-AU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            {frameworkData.lastUpdated && (
              <div>
                <span className="font-medium">Page Updated:</span>{' '}
                {parseCalendarDateForDisplay(
                  frameworkData.lastUpdated,
                ).toLocaleDateString('en-AU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            )}
            <div>
              <span className="font-medium">Version:</span> {frameworkData.version}
            </div>
            <div>
              <span className="font-medium">Authority:</span> {frameworkData.authority}
            </div>
            <div>
              <span className="font-medium">Verification:</span>{' '}
              {frameworkData.verification.status === 'verified'
                ? 'Verified'
                : 'Needs review'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
