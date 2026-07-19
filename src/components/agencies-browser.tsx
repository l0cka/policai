'use client';

import { Fragment, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JURISDICTION_NAMES, type Agency } from '@/types';
import { MetricStrip, PageIntro } from '@/components/layout';

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
        title="Agency transparency"
        description="Browse Australian Government agency AI transparency statements, public disclosures and their current source-verification state."
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
        <div className="relative">
          <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-border/60 pl-5 pb-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 transition-colors"
          />
        </div>

        <Select value={statementFilter} onValueChange={setStatementFilter}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agencies</SelectItem>
            <SelectItem value="published">Verified statement</SelectItem>
            <SelectItem value="not-published">Verified none located</SelectItem>
            <SelectItem value="awaiting-review">Awaiting review</SelectItem>
          </SelectContent>
        </Select>

        <p className="font-mono text-xs text-muted-foreground">
          {stats.total} agencies &middot; {stats.withStatements} verified statements
          {' '}&middot; {stats.awaitingReview} awaiting review
        </p>
      </aside>

      {/* Main area */}
      <main className="min-w-0 flex-1 py-6 md:pl-8">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-44" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-y border-foreground/55">
                <th className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.1em]">Agency</th>
                <th className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.1em]">Acronym</th>
                <th className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-[0.1em]">Jurisdiction</th>
                <th className="py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em]">Statement</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgencies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No agencies found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredAgencies.map((agency) => {
                  const isExpanded = expandedId === agency.id;

                  return (
                    <Fragment key={agency.id}>
                      <tr
                        className="cursor-pointer border-b border-border/30 align-top transition-colors hover:bg-[var(--row-hover)]"
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
                        <td className="py-3 pr-4">
                          <span className="block font-medium text-foreground">{agency.name}</span>
                        </td>
                        <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
                          {agency.acronym}
                        </td>
                        <td className="py-3 pr-4 align-top text-muted-foreground">
                          {JURISDICTION_NAMES[agency.jurisdiction]}
                        </td>
                        <td
                          className={`py-3 align-top ${
                            agency.verification.status !== 'verified'
                              ? 'text-[var(--status-proposed)]'
                              : agency.hasPublishedStatement
                              ? 'text-[var(--status-active)]'
                              : 'text-[var(--status-proposed)]'
                          }`}
                        >
                          {agency.verification.status !== 'verified'
                            ? 'Awaiting review'
                            : agency.hasPublishedStatement
                              ? 'Verified'
                              : 'None located'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr id={`agency-details-${agency.id}`} className="border-b border-border/20">
                          <td colSpan={4} className="pb-4 pr-4 text-sm text-muted-foreground">
                            <div className="space-y-3">
                              {agency.aiTransparencyStatement && (
                                <div>
                                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
                                    Transparency Statement
                                  </span>
                                  <p className="mt-1">{agency.aiTransparencyStatement}</p>
                                </div>
                              )}
                              {agency.aiUsageDisclosure && (
                                <div>
                                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
                                    AI Usage
                                  </span>
                                  <p className="mt-1">{agency.aiUsageDisclosure}</p>
                                </div>
                              )}
                              {agency.lastUpdated && (
                                <div>
                                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
                                    Last Updated
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
      </div>
    </div>
  );
}
