'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyStatusName,
  getPolicyTypeName,
  getPrimaryPolicyDate,
  type Policy,
} from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';
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

function StatusPill({ status }: { status: Policy['status'] }) {
  const tone =
    status === 'active'
      ? 'border-[var(--trust)]/20 bg-[var(--status-active-bg)] text-[var(--status-active)]'
      : status === 'proposed'
        ? 'border-[var(--caution)]/20 bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]'
        : status === 'amended'
          ? 'border-primary/20 bg-[var(--status-amended-bg)] text-[var(--status-amended)]'
          : 'border-border bg-[var(--status-repealed-bg)] text-[var(--status-repealed)]';

  return (
    <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', tone)}>
      {getPolicyStatusName(status)}
    </span>
  );
}

function SourceState({ policy }: { policy: Policy }) {
  const verified = policy.verification.status === 'verified';

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
    <article className="content-auto border border-border bg-card/45 p-4">
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
        {getJurisdictionName(policy.jurisdiction)}
        <span className="mx-2 text-border">•</span>
        {getPolicyTypeName(policy.type)}
      </p>
      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-3 border-t border-border pt-3 sm:grid-cols-[auto_auto_1fr_auto]">
        <StatusPill status={policy.status} />
        <span className="font-mono text-[10px] uppercase leading-4 text-muted-foreground">
          {formatPolicyDate(primaryDate, { short: true })}
          <span className="block">{getPolicyDateTypeName(primaryDate.type)}</span>
        </span>
        <SourceState policy={policy} />
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

  const sortLabel = (field: PolicySortField, label: string) =>
    `${label}${sortField === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;

  if (paged.length === 0) {
    return (
      <div className="border-y border-border py-14 text-center">
        <p className="font-display text-2xl">No matching policies</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try removing a filter or broadening the search.
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
                <tr className="border-y border-foreground/55">
                  {([
                    ['title', 'Policy', 'w-[33%]'],
                    ['jurisdiction', 'Jurisdiction', 'w-[16%]'],
                    ['type', 'Type', 'w-[11%]'],
                    ['status', 'Status', 'w-[10%]'],
                    ['effectiveDate', 'Key date', 'w-[11%]'],
                  ] as const).map(([field, label, width]) => (
                    <th key={field} className={cn('py-2 pr-3 text-left', width)}>
                      <button
                        type="button"
                        onClick={() => handleSort(field)}
                        className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                      >
                        {sortLabel(field, label)}
                      </button>
                    </th>
                  ))}
                  <th className="w-[16%] py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Source
                  </th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {paged.map((policy) => {
                  const primaryDate = getPrimaryPolicyDate(policy);
                  return (
                    <tr key={policy.id} className="content-auto border-b border-border transition-colors hover:bg-[var(--row-hover)]">
                      <td className="py-3 pr-5 align-top">
                        <Link href={`/policies/${policy.id}`} className="text-sm font-semibold leading-5 text-primary hover:underline">
                          {policy.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-4 text-muted-foreground">
                          {policy.description}
                        </p>
                      </td>
                      <td className="py-3 pr-3 align-top text-xs leading-5 text-muted-foreground">
                        {getJurisdictionName(policy.jurisdiction)}
                      </td>
                      <td className="py-3 pr-3 align-top text-xs leading-5 text-muted-foreground">
                        {getPolicyTypeName(policy.type)}
                      </td>
                      <td className="py-3 pr-3 align-top"><StatusPill status={policy.status} /></td>
                      <td className="py-3 pr-3 align-top font-mono text-[10px] uppercase leading-4 text-muted-foreground">
                        {formatPolicyDate(primaryDate, { short: true })}
                        <span className="block">{getPolicyDateTypeName(primaryDate.type)}</span>
                      </td>
                      <td className="py-3 align-top"><SourceState policy={policy} /></td>
                      <td className="py-3 align-top">
                        <Link href={`/policies/${policy.id}`} aria-label={`View ${policy.title}`} className="text-primary">
                          <ArrowRight className="h-4 w-4" />
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
            <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="min-h-10 border border-border px-4 text-xs font-medium hover:bg-muted disabled:opacity-35">
              Previous
            </button>
            <button type="button" onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1} className="min-h-10 border border-border px-4 text-xs font-medium hover:bg-muted disabled:opacity-35">
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
