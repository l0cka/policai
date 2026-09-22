import { CheckCircle2 } from 'lucide-react';
import { getJurisdictionName, getPolicyStatusName, type Policy } from '@/types';
import { jurisdictionAccent } from '@/lib/jurisdiction-accent';
import { cn } from '@/lib/utils';

export function StatusPill({ status, dates = [] }: { status: Policy['status']; dates?: Policy['dates'] }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const commencementDates = dates.filter(({ type }) => type === 'effective' || type === 'commenced');
  // All known commencement dates must be future. Do not infer a day from a
  // month/year date, or mistake publication/the legacy alias for commencement.
  const notYetEffective = (status === 'active' || status === 'amended') && commencementDates.length > 0 && commencementDates.every(({ date, precision }) => {
    const length = precision === 'year' ? 4 : precision === 'month' ? 7 : 10;
    const value = date instanceof Date ? date.toISOString() : date;
    return value.slice(0, length) > today.slice(0, length);
  });
  const tone =
    notYetEffective
      ? 'border-[var(--caution)]/25 bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]'
      : status === 'active'
      ? 'border-[var(--trust)]/25 bg-[var(--status-active-bg)] text-[var(--status-active)]'
      : status === 'proposed'
        ? 'border-[var(--caution)]/25 bg-[var(--status-proposed-bg)] text-[var(--status-proposed)]'
        : status === 'amended'
          ? 'border-primary/25 bg-[var(--status-amended-bg)] text-[var(--status-amended)]'
          : 'border-border bg-[var(--status-repealed-bg)] text-[var(--status-repealed)]';

  return (
    <span
      className={cn(
        'inline-flex flex-col rounded-md border px-2 py-1 text-xs font-medium',
        tone,
      )}
    >
      <span>{getPolicyStatusName(status)}</span>
      {notYetEffective ? <span>Not yet in effect</span> : null}
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

export function SourceState({
  verification,
}: {
  verification: Pick<Policy['verification'], 'status'>;
}) {
  const verified = verification.status === 'verified';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        verified ? 'text-[var(--trust)]' : 'text-[var(--caution)]',
      )}
    >
      <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
      <span className="text-muted-foreground">
        {verified ? 'Verified source' : 'Needs review'}
      </span>
    </span>
  );
}
