'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp, ChevronsUpDown, CheckCircle2 } from 'lucide-react';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyStatusName,
  getPolicyTypeName,
  getPrimaryPolicyDate,
  type Policy,
} from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { jurisdictionAccent, jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import { cn } from '@/lib/utils';

export type PolicySortField = 'title' | 'jurisdiction' | 'type' | 'status' | 'effectiveDate';
export type PolicySortDirection = 'asc' | 'desc';
export type PolicyViewMode = 'table' | 'list';

function comparePolicies(a: Policy, b: Policy, field: PolicySortField): number {
  if (field === 'effectiveDate') {
    return String(getPrimaryPolicyDate(a).date).localeCompare(
      String(getPrimaryPolicyDate(b).date),
    );
  }

  return String(a[field]).localeCompare(String(b[field]));
}

export function StatusPill({ status }: { status: Policy['status'] }) {
  const tone =
    status === 'active'
      ? 'border-[var(--trust)]/25 bg-[var(--status-active-bg)] text-[var(--status-active)]'
      : status === 'proposed'
        ? 'border-[var(--caution)]/25 bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]'
        : status === 'amended'
          ? 'border-primary/25 bg-[var(--status-amended-bg)] text-[var(--status-amended)]'
          : 'border-border bg-[var(--status-repealed-bg)] text-[var(--status-repealed)]';

  return (
    <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', tone)}>
      {getPolicyStatusName(status)}
    </span>
  );
}

/** Jurisdiction name preceded by its livery colour, so rows group by eye. */
export function JurisdictionMark({
  jurisdiction,
  className,
}: {
  jurisdiction: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: jurisdictionAccent(jurisdiction) }}
      />
      {getJurisdictionName(jurisdiction)}
    </span>
  );
}

export function SourceState({ verification }: { verification: Policy['verification'] }) {
  const verified = verification.status === 'verified';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        verified ? 'text-[var(--trust)]' : 'text-[var(--caution)]',
      )}
    >
      <CheckCircle2 className="h-4 w-4" fill="currentColor" strokeWidth={1.8} />
      <span className="text-muted-foreground">
        {verified ? 'Verified source' : 'Needs review'}
      </span>
    </span>
  );
}

function PolicyCard({ policy, compact = false }: { policy: Policy; compact?: boolean }) {
  const primaryDate = getPrimaryPolicyDate(policy);

  return (
    <article
      style={jurisdictionRailStyle(policy.jurisdiction)}
      className="ink-rail hover-lift content-auto border border-border bg-card/45 p-4 pl-5 hover:border-[var(--rule)]"
    >
      <Link
        href={`/policies/${policy.id}`}
        className="text-[17px] font-semibold leading-snug text-primary hover:underline"
      >
        {policy.title}
      </Link>
      {!compact ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
          {policy.description}
        </p>
      ) : null}
      <p className="mt-3 text-sm">
        <JurisdictionMark jurisdiction={policy.jurisdiction} />
        <span className="mx-2 text-border">•</span>
        {getPolicyTypeName(policy.type)}
      </p>
      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-3 border-t border-border pt-3 sm:grid-cols-[auto_auto_1fr_auto]">
        <StatusPill status={policy.status} />
        <span className="font-mono text-[10px] uppercase leading-4 text-muted-foreground">
          {formatPolicyDate(primaryDate, { short: true })}
          <span className="block">{getPolicyDateTypeName(primaryDate.type)}</span>
        </span>
        <SourceState verification={policy.verification} />
        <Link
          href={`/policies/${policy.id}`}
          aria-label={`View ${policy.title}`}
          className="ml-auto hidden text-primary sm:inline-flex"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function PolicyTable({
  policies,
  viewMode,
  mobileViewMode,
  sortField,
  sortDirection,
  onSort,
}: {
  policies: Policy[];
  viewMode: PolicyViewMode;
  mobileViewMode: PolicyViewMode;
  sortField: PolicySortField;
  sortDirection: PolicySortDirection;
  onSort: (field: PolicySortField) => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const sorted = useMemo(
    () =>
      [...policies].sort((a, b) => {
        const comparison = comparePolicies(a, b, sortField);
        return sortDirection === 'asc' ? comparison : -comparison;
      }),
    [policies, sortDirection, sortField],
  );

  const totalPages = Math.ceil(sorted.length / pageSize);
  const safePage = totalPages > 0 ? Math.min(page, totalPages - 1) : 0;
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleSort = (field: PolicySortField) => {
    setPage(0);
    onSort(field);
  };

  if (paged.length === 0) {
    return (
      <div className="border-y border-border py-14 text-center">
        <p className="section-title">Nothing matches those filters</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Remove a filter or search for a broader term.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-3 md:hidden">
        {paged.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} compact={mobileViewMode === 'table'} />
        ))}
      </div>
      {viewMode === 'list' ? (
        <div className="hidden space-y-3 md:block">
          {paged.map((policy) => <PolicyCard key={policy.id} policy={policy} />)}
        </div>
      ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-y border-[var(--rule-heavy)]">
                  {([
                    ['title', 'Policy', 'w-[32%] pl-3'],
                    ['jurisdiction', 'Jurisdiction', 'w-[15%]'],
                    ['type', 'Type', 'w-[10%]'],
                    ['status', 'Status', 'w-[10%]'],
                    ['effectiveDate', 'Key date', 'w-[13%]'],
                  ] as const).map(([field, label, width]) => {
                    const isSorted = sortField === field;
                    const SortIcon = !isSorted
                      ? ChevronsUpDown
                      : sortDirection === 'asc'
                        ? ChevronUp
                        : ChevronDown;
                    return (
                      <th
                        key={field}
                        className={cn('py-2.5 pr-3 text-left', width)}
                        aria-sort={
                          isSorted
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(field)}
                          className={cn(
                            'group inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.1em] transition-colors duration-[var(--dur-fast)]',
                            isSorted
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                          <SortIcon
                            className={cn(
                              'h-3 w-3 transition-opacity duration-[var(--dur-fast)]',
                              isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
                            )}
                            strokeWidth={2.2}
                          />
                        </button>
                      </th>
                    );
                  })}
                  <th className="w-[15%] whitespace-nowrap py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Source
                  </th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {paged.map((policy) => {
                  const primaryDate = getPrimaryPolicyDate(policy);
                  return (
                    <tr
                      key={policy.id}
                      style={jurisdictionRailStyle(policy.jurisdiction)}
                      className="group/row content-auto border-b border-border transition-colors duration-[var(--dur-fast)] hover:bg-[var(--row-hover)]"
                    >
                      <td className="ink-rail py-3 pl-3 pr-5 align-top">
                        <Link
                          href={`/policies/${policy.id}`}
                          className="text-sm font-semibold leading-5 text-primary hover:underline"
                        >
                          {policy.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-4 text-muted-foreground">
                          {policy.description}
                        </p>
                      </td>
                      <td className="py-3 pr-3 align-top text-xs leading-5 text-muted-foreground">
                        <JurisdictionMark jurisdiction={policy.jurisdiction} />
                      </td>
                      <td className="py-3 pr-3 align-top text-xs leading-5 text-muted-foreground">
                        {getPolicyTypeName(policy.type)}
                      </td>
                      <td className="py-3 pr-3 align-top"><StatusPill status={policy.status} /></td>
                      <td className="py-3 pr-3 align-top font-mono text-[10px] uppercase leading-4 text-muted-foreground">
                        {formatPolicyDate(primaryDate, { short: true })}
                        <span className="block">{getPolicyDateTypeName(primaryDate.type)}</span>
                      </td>
                      <td className="py-3 align-top"><SourceState verification={policy.verification} /></td>
                      <td className="py-3 align-top">
                        <Link
                          href={`/policies/${policy.id}`}
                          aria-label={`View ${policy.title}`}
                          className="text-primary"
                        >
                          <ArrowRight className="h-4 w-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)] group-hover/row:translate-x-1" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <span className="font-mono text-[11px] text-muted-foreground">
            Page {safePage + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="min-h-10 rounded-md border border-border px-4 text-xs font-medium transition-colors duration-[var(--dur-fast)] hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="min-h-10 rounded-md border border-border px-4 text-xs font-medium transition-colors duration-[var(--dur-fast)] hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
