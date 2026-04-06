import { PolicyFrameworkMap } from '@/components/visualizations/PolicyFrameworkMap';
import frameworkData from '@/../public/data/dta-ai-policy-framework.json';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = {
  title: 'Policy for the Responsible Use of AI in Government | Policai',
  description: 'Interactive visualization of Australia\'s Policy for the Responsible Use of AI in Government',
};

export default function FrameworkPage() {
  return (
    <div className="container mx-auto px-4 py-8">
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

      {/* Info Banner */}
      <Card className="mb-8 bg-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold mb-2">
                Australian Government AI Policy Visual Map
              </h1>
              <p className="text-sm text-muted-foreground">
                This interactive visualization breaks down the DTA&apos;s Policy for the Responsible Use of AI
                in Government (Version 2.0). Click on pillars to explore principles and requirements.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://www.digital.gov.au/ai/ai-in-government-policy"
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

      {/* Framework Visualization */}
      <PolicyFrameworkMap data={frameworkData} />

      {/* Footer Note */}
      <div className="mt-12 p-6 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">About This Visualization</h3>
        <p className="text-sm text-muted-foreground">
          This visual map represents the structure and requirements of the Australian Government&apos;s
          AI policy as published by the Digital Transformation Agency. The policy applies to all
          non-corporate Commonwealth entities and provides a framework for responsible AI adoption.
          For the authoritative source, please refer to the{' '}
          <a
            href="https://www.digital.gov.au/ai/ai-in-government-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            official DTA website
          </a>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">Last Updated:</span>{' '}
            {new Date(frameworkData.effectiveDate).toLocaleDateString('en-AU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div>
            <span className="font-medium">Version:</span> {frameworkData.version}
          </div>
          <div>
            <span className="font-medium">Authority:</span> {frameworkData.authority}
          </div>
        </div>
      </div>
    </div>
  );
}
