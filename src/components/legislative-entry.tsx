import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import type { DatedEntry } from '@/lib/legislation/overview';
import { precisionDateTime } from '@/lib/this-week';
import { getJurisdictionName, getPolicyTypeName } from '@/types';

export function EntryDate({ entry }: { entry: DatedEntry }) {
  return (
    <time
      dateTime={precisionDateTime(entry.date, entry.precision)}
      className="font-mono text-[11px] font-medium uppercase text-muted-foreground tabular"
    >
      {formatPolicyDate({ type: 'published', date: entry.date, precision: entry.precision }, { short: true })}
    </time>
  );
}

export function RecordLink({ entry }: { entry: Pick<DatedEntry, 'record'> }) {
  return (
    <Link href={`/policies/${entry.record.id}`} className="record-title hover:text-primary">
      {entry.record.title}
    </Link>
  );
}

export function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      Source
      <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
    </a>
  );
}

export function EntryRow({ entry }: { entry: DatedEntry }) {
  return (
    <article
      style={jurisdictionRailStyle(entry.record.jurisdiction)}
      className="ink-rail grid gap-1.5 border-b border-border py-3 pl-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-2 sm:py-4"
    >
      <EntryDate entry={entry} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {entry.label} · {getJurisdictionName(entry.record.jurisdiction)} ·{' '}
          {getPolicyTypeName(entry.record.type)}
        </p>
        <RecordLink entry={entry} />
        {entry.detail ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
        ) : null}
        <div className="mt-1.5 text-xs">
          <SourceLink href={entry.sourceUrl} />
        </div>
      </div>
    </article>
  );
}
