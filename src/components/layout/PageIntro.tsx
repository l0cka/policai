import type { ReactNode } from 'react';
import { CountUp } from '@/components/ui/count-up';
import { cn } from '@/lib/utils';

export function PageIntro({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pb-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="reveal">
          {eyebrow ? <p className="page-eyebrow mb-2.5">{eyebrow}</p> : null}
          <h1 className="page-title">{title}</h1>
          {description ? (
            <div className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? <div className="reveal reveal-1 shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

/**
 * Column of figures under a page heading, set like a broadsheet statistics
 * band: a mono label above a display numeral, separated by hairline rules.
 */
export function MetricStrip({
  metrics,
  className,
}: {
  metrics: Array<{ label: string; value: number | string }>;
  className?: string;
}) {
  return (
    // Space separates the figures; a single hairline holds the band. Internal
    // dividers made this read as a table of its own and competed with the data.
    <dl
      className={cn(
        'reveal reveal-1 flex flex-wrap gap-x-10 gap-y-4 border-y border-[var(--rule-hair)] py-4',
        className,
      )}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="flex items-baseline gap-2">
          <dd className="font-mono text-lg leading-none tabular tracking-tight">
            {typeof metric.value === 'number' ? (
              <CountUp value={metric.value} />
            ) : (
              metric.value
            )}
          </dd>
          <dt className="page-eyebrow">{metric.label}</dt>
        </div>
      ))}
    </dl>
  );
}
