import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatPolicyDate } from '@/lib/format-policy-date';
import {
  precisionDateTime,
  upcomingDateCountdown,
  type UpcomingPolicyDate,
} from '@/lib/this-week';
import { getJurisdictionName, getPolicyDateTypeName } from '@/types';

/*
 * The homepage deadlines rail. It has no client state, so the page renders it
 * on the server and passes it into the register as a slot. Callers supply
 * deadline items selected from public getPolicies() output; the rail never
 * reads data itself. When the register records no upcoming deadline, the rail
 * stays visible and says so.
 */
export function UpcomingDeadlinesRail({
  items,
  today,
  limit = 5,
}: {
  /** Upcoming deadline dates from public records, soonest first. */
  items: readonly UpcomingPolicyDate[];
  /** The Sydney calendar day (YYYY-MM-DD) countdowns are measured from. */
  today: string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);

  return (
    <section
      aria-labelledby="upcoming-deadlines-heading"
      className="border-t border-border pt-6"
    >
      <h2 id="upcoming-deadlines-heading" className="text-sm font-semibold">
        Upcoming deadlines
      </h2>
      {shown.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {shown.map((item) => {
            const countdown = upcomingDateCountdown(item, today);
            return (
              <li key={`${item.policyId}-${item.dateType}-${item.date}`}>
                <p className="text-[11px] text-muted-foreground">
                  {getPolicyDateTypeName(item.dateType)} ·{' '}
                  <time dateTime={precisionDateTime(item.date, item.precision)}>
                    {formatPolicyDate({
                      type: item.dateType,
                      date: item.date,
                      precision: item.precision,
                    })}
                  </time>
                  {countdown ? ` · ${countdown}` : ''}
                </p>
                <Link
                  href={`/policies/${item.policyId}`}
                  className="mt-1 inline-block text-xs leading-5 text-primary underline underline-offset-4"
                >
                  {item.policyTitle}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {getJurisdictionName(item.jurisdiction)}
                  {item.precision !== 'day' ? ' · exact day not recorded' : ''}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 border border-dashed border-border p-3">
          <p className="text-xs font-medium">No upcoming deadlines recorded</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Consultation closing dates, compliance dates and scheduled reviews
            appear here once an editor records them against the official
            source.
          </p>
        </div>
      )}
      <Link
        href="/this-week#coming-up"
        className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs text-primary"
      >
        All deadlines on This week{' '}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
