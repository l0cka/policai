import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getPrimaryPolicyDate,
  JURISDICTIONS,
  type Jurisdiction,
  type Policy,
} from '@/types';

const jurisdictionLabel: Record<Jurisdiction, string> = {
  federal: 'Federal',
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  wa: 'Western Australia',
  sa: 'South Australia',
  tas: 'Tasmania',
  act: 'Australian Capital Territory',
  nt: 'Northern Territory',
};

const legendItems = [
  { label: 'Active', className: 'bg-[var(--hero-trust)]' },
  { label: 'Amended', className: 'bg-[var(--hero-amended)]' },
  { label: 'New (last 30 days)', className: 'bg-[var(--hero-new)]' },
  { label: 'Planned / Draft', className: 'border border-white/65 bg-transparent' },
  { label: 'Inactive', className: 'bg-white/28' },
];

function safePolicyDate(policy: Policy): { date: Date; dateType: string } | null {
  const primary = getPrimaryPolicyDate(policy);
  const date = new Date(primary.date);
  return Number.isNaN(date.getTime()) ? null : { date, dateType: primary.type };
}

function formatAxisDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    month: 'short',
    year: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

function pointClass(
  policy: Policy,
  date: Date,
  dateType: string,
  currentDate: Date,
): string {
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (currentDate.getTime() - date.getTime() <= thirtyDays && date <= currentDate) {
    return 'bg-[var(--hero-new)]';
  }
  if (policy.status === 'proposed') return 'border border-white/65 bg-[var(--hero-bg)]';
  // Amendment is an event in this register, not a status: an amended policy
  // stays active and carries an 'amended' date. Colour by the event, or the
  // legend's amber can never occur.
  if (dateType === 'amended') return 'bg-[var(--hero-amended)]';
  if (policy.status === 'active') return 'bg-[var(--hero-trust)]';
  return 'bg-white/28';
}

export function PolicyObservatory({
  policies,
  currentAt,
}: {
  policies: Policy[];
  currentAt: string | null;
}) {
  const datedPolicies = policies
    .map((policy) => ({ policy, dated: safePolicyDate(policy) }))
    .filter(
      (item): item is { policy: Policy; dated: { date: Date; dateType: string } } =>
        item.dated !== null,
    )
    .map(({ policy, dated }) => ({ policy, date: dated.date, dateType: dated.dateType }));
  const timestamps = datedPolicies.map(({ date }) => date.getTime());
  const fallbackCurrent = Math.max(...timestamps);
  const parsedCurrent = currentAt ? new Date(currentAt) : new Date(fallbackCurrent);
  const currentDate = Number.isNaN(parsedCurrent.getTime()) ? new Date(fallbackCurrent) : parsedCurrent;
  const start = new Date(Math.min(...timestamps, currentDate.getTime()));
  const end = new Date(Math.max(...timestamps, currentDate.getTime()));
  const span = Math.max(end.getTime() - start.getTime(), 1);
  const axisDates = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => new Date(start.getTime() + span * ratio),
  );
  const todayPosition = Math.min(
    Math.max(((currentDate.getTime() - start.getTime()) / span) * 100, 0),
    100,
  );

  return (
    <figure className="w-full min-w-0 flex-1" aria-labelledby="policy-field-title">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-5">
        <h2
          id="policy-field-title"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white"
        >
          Policy field
        </h2>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {legendItems.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2 text-[10px] text-white/58">
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', item.className)} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="w-full min-w-[650px] lg:min-w-0">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute bottom-0 top-0 z-10 border-l border-white/48"
              style={{ left: `calc(9.5rem + (100% - 9.5rem) * ${(todayPosition / 100).toFixed(4)})` }}
            >
              <span className="absolute -translate-x-1/2 -top-5 font-mono text-[9px] uppercase tracking-[0.1em] text-white">
                Today
              </span>
            </div>

            {JURISDICTIONS.map((jurisdiction) => {
              const jurisdictionPolicies = datedPolicies.filter(
                ({ policy }) => policy.jurisdiction === jurisdiction,
              );

              return (
                <div
                  key={jurisdiction}
                  className="grid h-[3.15rem] grid-cols-[9.5rem_1fr] items-center"
                >
                  <span className="pr-4 text-[12px] font-medium text-[var(--hero-accent)]">
                    {jurisdictionLabel[jurisdiction]}
                    <span className="ml-2 font-mono text-[10px] text-white/48">
                      {jurisdictionPolicies.length}
                    </span>
                  </span>
                  <div className="relative h-full border-b border-white/20">
                    {jurisdictionPolicies.map(({ policy, date, dateType }, index) => {
                      const left = ((date.getTime() - start.getTime()) / span) * 100;
                      const y = 50 + ((index % 3) - 1) * 11;
                      return (
                        <Link
                          key={policy.id}
                          href={`/policies/${policy.id}`}
                          title={`${policy.title} — ${formatAxisDate(date)}`}
                          aria-label={`Open ${policy.title}`}
                          className={cn(
                            'absolute z-20 block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-[var(--hero-bg)] transition duration-150 hover:z-30 hover:scale-[1.75] focus:z-30 focus:scale-[1.75]',
                            pointClass(policy, date, dateType, currentDate),
                          )}
                          style={{
                            left: `${Math.min(Math.max(left, 0.6), 99.4).toFixed(3)}%`,
                            top: `${y}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <figcaption className="ml-[9.5rem] mt-3 flex justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-white/42">
            {axisDates.map((date, index) => (
              <span key={`${date.toISOString()}-${index}`}>{formatAxisDate(date)}</span>
            ))}
          </figcaption>
        </div>
      </div>
    </figure>
  );
}
