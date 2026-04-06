'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Jurisdiction,
  type PolicyType,
  type PolicyStatus,
} from '@/types';

import { STATUS_COLORS } from '@/lib/design-tokens';

interface PolicyRow {
  id: string;
  title: string;
  jurisdiction: string;
  type: string;
  status: string;
  effectiveDate: string | Date;
}

type SortField = 'title' | 'jurisdiction' | 'type' | 'status' | 'effectiveDate';
type SortDirection = 'asc' | 'desc';

function SortIndicator({ field, current, direction }: { field: SortField; current: SortField; direction: SortDirection }) {
  if (field !== current) return <span className="text-transparent ml-1">&uarr;</span>;
  return <span className="ml-1">{direction === 'asc' ? '\u2191' : '\u2193'}</span>;
}

interface PolicyTableProps {
  policies: PolicyRow[];
}

export function PolicyTable({ policies }: PolicyTableProps) {
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...policies].sort((a, b) => {
    const aRaw = a[sortField];
    const bRaw = b[sortField];
    const aVal = aRaw instanceof Date ? aRaw.toISOString() : (aRaw || '');
    const bVal = bRaw instanceof Date ? bRaw.toISOString() : (bRaw || '');
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  // Clamp page to valid range (auto-resets when filters shrink the list)
  const safePage = totalPages > 0 ? Math.min(page, totalPages - 1) : 0;
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const formatDate = (dateStr: string | Date) => {
    if (!dateStr) return '\u2014';
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  };

  const columns: { key: SortField; label: string; className: string }[] = [
    { key: 'title', label: 'Policy', className: 'text-left' },
    { key: 'jurisdiction', label: 'Jurisdiction', className: 'text-left hidden md:table-cell' },
    { key: 'type', label: 'Type', className: 'text-left hidden lg:table-cell' },
    { key: 'status', label: 'Status', className: 'text-left' },
    { key: 'effectiveDate', label: 'Date', className: 'text-left hidden sm:table-cell' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.className} py-2 pr-4 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <SortIndicator field={col.key} current={sortField} direction={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((policy) => (
            <tr key={policy.id} className="border-b border-border transition-colors hover:bg-[var(--row-hover)]">
              <td className="py-3 pr-4">
                <Link
                  href={`/policies/${policy.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {policy.title}
                </Link>
                <div className="md:hidden mt-1 font-mono text-xs text-muted-foreground">
                  {JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction] || policy.jurisdiction}
                  {' \u00b7 '}
                  {POLICY_TYPE_NAMES[policy.type as PolicyType] || policy.type}
                </div>
              </td>
              <td className="py-3 pr-4 text-sm text-muted-foreground hidden md:table-cell">
                {JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction] || policy.jurisdiction}
              </td>
              <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
                {POLICY_TYPE_NAMES[policy.type as PolicyType] || policy.type}
              </td>
              <td className={`py-3 pr-4 text-sm font-medium ${STATUS_COLORS[policy.status] || 'text-muted-foreground'}`}>
                {POLICY_STATUS_NAMES[policy.status as PolicyStatus] || policy.status}
              </td>
              <td className="py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                {formatDate(policy.effectiveDate)}
              </td>
            </tr>
          ))}
          {paged.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No policies match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
          <div className="font-mono text-xs text-muted-foreground">
            Page {safePage + 1} of {totalPages}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="font-mono text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="font-mono text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
