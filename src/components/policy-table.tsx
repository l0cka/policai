'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from 'lucide-react';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyTypeName,
  getPrimaryPolicyDate,
  type Policy,
} from '@/types';
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  jurisdictionRailStyle,
} from '@/lib/jurisdiction-accent';
import { cn } from '@/lib/utils';

import { REGISTER_PAGE_SIZE, type PolicySortField, type PolicySortDirection, type PolicyViewMode } from '@/lib/policy-register';

import { JurisdictionMark, SourceState, StatusPill } from './policy-indicators';


function PolicyCard({
  policy,
  compact = false,
}: {
  policy: Policy;
  compact?: boolean;
}) {
  const primaryDate = getPrimaryPolicyDate(policy);

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-border py-5 sm:gap-x-6">
      <div className="min-w-0">
        <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{getJurisdictionName(policy.jurisdiction)}</span>
          <span aria-hidden="true">/</span>
          <span>{getPolicyTypeName(policy.type)}</span>
        </p>
        <h2 className="text-[15px] font-semibold leading-6 sm:text-base">
          <Link
            href={`/policies/${policy.id}`}
            className="text-foreground hover:text-primary hover:underline"
          >
            {policy.title}
          </Link>
        </h2>
        {!compact && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {policy.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <SourceState verification={policy.verification} />
          <a
            href={policy.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Official source for ${policy.title}`}
            className="inline-flex min-h-11 items-center text-xs text-primary underline underline-offset-4"
          >
            Official source ↗
          </a>
        </div>
      </div>
      <div className="flex max-w-28 flex-col items-end gap-3 text-right">
        <StatusPill status={policy.status} dates={policy.dates} />
        <span className="mt-1 text-[11px] leading-5">
          {formatPolicyDate(primaryDate, { short: true })}
          <span className="block text-[10px] text-muted-foreground">
            {getPolicyDateTypeName(primaryDate.type)}
          </span>
        </span>
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
  page,
  onPageChange,
  onReset,
}: {
  policies: Policy[];
  viewMode: PolicyViewMode;
  mobileViewMode: PolicyViewMode;
  sortField: PolicySortField;
  sortDirection: PolicySortDirection;
  onSort: (field: PolicySortField) => void;
  page: number;
  onPageChange: (page: number) => void;
  onReset: () => void;
}) {
  const totalPages = Math.ceil(policies.length / REGISTER_PAGE_SIZE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const paged = policies.slice((safePage - 1) * REGISTER_PAGE_SIZE, safePage * REGISTER_PAGE_SIZE);
  const changePage = (next: number) => {
    onPageChange(next);
    document.getElementById('register-results')?.focus();
    document.getElementById('register-results')?.scrollIntoView?.({ block: 'start' });
  };

  if (paged.length === 0) {
    return (
      <div className="border-y border-border py-14 text-center">
        <p className="section-title">Nothing matches those filters</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Remove a filter or search for a broader term.
        </p>
        <button type="button" onClick={onReset} className="mt-4 min-h-11 rounded border border-input px-4 text-sm text-primary">Reset the register</button>
      </div>
    );
  }

  return (
    <div>
      <div className="md:hidden">
        {paged.map((policy) => (
          <PolicyCard
            key={policy.id}
            policy={policy}
            compact={mobileViewMode === 'table'}
          />
        ))}
      </div>
      {viewMode === 'list' ? (
        <div className="hidden md:block">
          {paged.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      ) : (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-y border-[var(--rule-heavy)]">
                {(
                  [
                    ['title', 'Policy', 'w-[32%] pl-3'],
                    ['jurisdiction', 'Jurisdiction', 'w-[15%]'],
                    ['type', 'Type', 'w-[10%]'],
                    ['status', 'Status', 'w-[10%]'],
                    ['effectiveDate', 'Key date', 'w-[13%]'],
                  ] as const
                ).map(([field, label, width]) => {
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
                        onClick={() => onSort(field)}
                        className={cn(
                          'group inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors duration-[var(--dur-fast)]',
                          isSorted
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                        <SortIcon
                          className={cn(
                            'h-3 w-3 transition-opacity duration-[var(--dur-fast)]',
                            isSorted
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-60',
                          )}
                          strokeWidth={2.2}
                        />
                      </button>
                    </th>
                  );
                })}
                <th className="w-[15%] whitespace-nowrap py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Source
                </th>
                <th className="w-6">
                  <span className="sr-only">Open</span>
                </th>
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
                    <td className="py-3 pr-3 align-top">
                      <StatusPill status={policy.status} dates={policy.dates} />
                    </td>
                    <td className="py-3 pr-3 align-top font-mono text-[11px] font-medium uppercase leading-4 text-muted-foreground">
                      {formatPolicyDate(primaryDate, { short: true })}
                      <span className="block">
                        {getPolicyDateTypeName(primaryDate.type)}
                      </span>
                    </td>
                    <td className="py-3 align-top">
                      <SourceState verification={policy.verification} />
                    </td>
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
            Page {safePage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => changePage(safePage - 1)}
              disabled={safePage === 1}
              className="min-h-11 rounded-md border border-border px-4 text-xs font-medium transition-colors duration-[var(--dur-fast)] hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => changePage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="min-h-11 rounded-md border border-border px-4 text-xs font-medium transition-colors duration-[var(--dur-fast)] hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
