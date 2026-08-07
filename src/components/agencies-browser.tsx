'use client';

import { Fragment, useState, useMemo } from 'react';
import { CheckCircle2, Circle, CircleAlert, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JurisdictionMark } from '@/components/policy-table';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import { type Agency } from '@/types';
import { MetricStrip, PageIntro } from '@/components/layout';

/** Verified / unverified / no-statement-found, in the same icon language as the register. */
function StatementState({ agency }: { agency: Agency }) {
  if (agency.verification.status !== 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--caution)]">
        <CircleAlert className="h-3.5 w-3.5" />
        Awaiting review
      </span>
    );
  }
  if (agency.hasPublishedStatement) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--trust)]">
        <CheckCircle2 className="h-3.5 w-3.5" fill="currentColor" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />
      None located
    </span>
  );
}

function AgencyDetails({ agency }: { agency: Agency }) {
  return (
    <div className="space-y-3">
      {agency.aiTransparencyStatement && (
        <div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
            Transparency statement
          </span>
          <p className="mt-1">{agency.aiTransparencyStatement}</p>
        </div>
      )}
      {agency.aiUsageDisclosure && (
        <div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
            AI usage
          </span>
          <p className="mt-1">{agency.aiUsageDisclosure}</p>
        </div>
      )}
      {agency.lastUpdated && (
        <div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
            Last updated
          </span>
          <p className="mt-1">
            {new Date(agency.lastUpdated).toLocaleDateString('en-AU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      )}
      <div>
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
          Verification
        </span>
        <p className="mt-1">
          {agency.verification.status === 'verified'
            ? 'Verified against the linked official source'
            : agency.verification.status === 'needs_review'
              ? 'Needs editorial review'
              : agency.verification.status === 'stale'
                ? 'Verification is stale'
                : 'Official source is currently unavailable'}
        </p>
      </div>
      {agency.transparencyStatementUrl && (
        <div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
            Official statement
          </span>
          <p className="mt-1">
            <a
              href={agency.transparencyStatementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {agency.transparencyStatementUrl}
            </a>
          </p>
        </div>
      )}
      {agency.website && (
        <div>
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
            Website
          </span>
          <p className="mt-1">
            <a
              href={agency.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {agency.website}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function AgencyCard({
  agency,
  isExpanded,
  onToggle,
}: {
  agency: Agency;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      style={jurisdictionRailStyle(agency.jurisdiction)}
      className="ink-rail hover-lift content-auto border border-border bg-card/45 p-4 pl-5"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full text-left"
      >
        <p className="text-[15px] font-semibold leading-snug">{agency.name}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{agency.acronym}</p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <JurisdictionMark jurisdiction={agency.jurisdiction} />
          <StatementState agency={agency} />
        </div>
      </button>
      {isExpanded ? (
        <div className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          <AgencyDetails agency={agency} />
        </div>
      ) : null}
    </article>
  );
}

export function AgenciesBrowser({ agencies }: { agencies: Agency[] }) {
  const [search, setSearch] = useState('');
  const [statementFilter, setStatementFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = agencies.length;
    const withStatements = agencies.filter(
      (a) =>
        a.verification.status === 'verified' && a.hasPublishedStatement,
    ).length;
    const withoutStatements = agencies.filter(
      (a) =>
        a.verification.status === 'verified' && !a.hasPublishedStatement,
    ).length;
    const awaitingReview = agencies.filter(
      (a) => a.verification.status !== 'verified',
    ).length;
    return { total, withStatements, withoutStatements, awaitingReview };
  }, [agencies]);

  const filteredAgencies = useMemo(() => {
    return agencies.filter((agency) => {
      const matchesSearch =
        search === '' ||
        agency.name.toLowerCase().includes(search.toLowerCase()) ||
        agency.acronym.toLowerCase().includes(search.toLowerCase());

      const matchesStatement =
        statementFilter === 'all' ||
        (statementFilter === 'published' &&
          agency.verification.status === 'verified' &&
          agency.hasPublishedStatement) ||
        (statementFilter === 'not-published' &&
          agency.verification.status === 'verified' &&
          !agency.hasPublishedStatement) ||
        (statementFilter === 'awaiting-review' &&
          agency.verification.status !== 'verified');

      return matchesSearch && matchesStatement;
    });
  }, [search, statementFilter, agencies]);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Agencies"
        description="Australian government agencies and the AI transparency statements located for each."
      />
      <MetricStrip metrics={[
        { value: stats.total, label: 'agencies' },
        { value: stats.withStatements, label: 'verified statements' },
        { value: stats.withoutStatements, label: 'none located' },
        { value: stats.awaitingReview, label: 'awaiting review' },
      ]} />
      <div className="flex min-h-[32rem] flex-col md:flex-row">
      {/* Sidebar - horizontal on mobile, vertical on desktop */}
      <aside className="w-full shrink-0 space-y-4 border-b border-border py-5 md:w-64 md:border-b-0 md:border-r md:pr-8">
        <label className="relative block">
          <span className="sr-only">Search agencies</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agencies"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <Select value={statementFilter} onValueChange={setStatementFilter}>
          <SelectTrigger aria-label="Filter agencies by statement status" className="!h-11 w-full text-sm">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agencies</SelectItem>
            <SelectItem value="published">Verified statement</SelectItem>
            <SelectItem value="not-published">Verified none located</SelectItem>
            <SelectItem value="awaiting-review">Awaiting review</SelectItem>
          </SelectContent>
        </Select>
      </aside>

      {/* Main area */}
      <div className="min-w-0 flex-1 py-6 md:pl-8">
        {filteredAgencies.length === 0 ? (
          <div className="border-y border-border py-14 text-center">
            <p className="section-title">No agencies match those filters</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Remove a filter or search for a broader term.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredAgencies.map((agency) => (
                <AgencyCard
                  key={agency.id}
                  agency={agency}
                  isExpanded={expandedId === agency.id}
                  onToggle={() => setExpandedId(expandedId === agency.id ? null : agency.id)}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[44rem] table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-28" />
                  <col className="w-44" />
                  <col className="w-32" />
                </colgroup>
                <thead>
                  <tr className="border-y border-[var(--rule-heavy)]">
                    <th className="py-2 pr-4 pl-3 text-left font-mono text-[11px] uppercase tracking-[0.1em]">Agency</th>
                    <th className="py-2 pr-4 text-left font-mono text-[11px] uppercase tracking-[0.1em]">Acronym</th>
                    <th className="py-2 pr-4 text-left font-mono text-[11px] uppercase tracking-[0.1em]">Jurisdiction</th>
                    <th className="py-2 text-left font-mono text-[11px] uppercase tracking-[0.1em]">Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgencies.map((agency) => {
                    const isExpanded = expandedId === agency.id;

                    return (
                      <Fragment key={agency.id}>
                        <tr
                          style={jurisdictionRailStyle(agency.jurisdiction)}
                          className="group/row content-auto cursor-pointer border-b border-border align-top transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)]"
                          onClick={() => setExpandedId(isExpanded ? null : agency.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setExpandedId(isExpanded ? null : agency.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-controls={`agency-details-${agency.id}`}
                        >
                          <td className="ink-rail py-3 pr-4 pl-3">
                            <span className="block font-semibold text-foreground">{agency.name}</span>
                          </td>
                          <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
                            {agency.acronym}
                          </td>
                          <td className="py-3 pr-4 align-top text-xs text-muted-foreground">
                            <JurisdictionMark jurisdiction={agency.jurisdiction} />
                          </td>
                          <td className="py-3 align-top">
                            <StatementState agency={agency} />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr id={`agency-details-${agency.id}`} className="border-b border-border">
                            <td colSpan={4} className="pb-4 pr-4 pl-3 text-sm text-muted-foreground">
                              <AgencyDetails agency={agency} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
