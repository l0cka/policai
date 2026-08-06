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
    <header className="border-b border-[var(--rule-heavy)] pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="reveal">
          {eyebrow ? (
            <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-[clamp(2.65rem,4vw,4rem)] leading-none tracking-[-0.035em]">
            {title}
          </h1>
          {description ? (
            <div className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
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
    <dl
      className={cn(
        'reveal reveal-1 grid grid-cols-2 border-b border-border lg:grid-cols-4',
        className,
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            'group relative px-1 py-4 text-center lg:py-5',
            index % 2 === 1 && 'border-l border-border',
            index > 1 && 'border-t border-border lg:border-l lg:border-t-0',
            index === 1 && 'lg:border-l',
          )}
        >
          <dd className="font-display text-4xl leading-none text-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quint)] group-hover:-translate-y-0.5">
            {typeof metric.value === 'number' ? (
              <CountUp value={metric.value} />
            ) : (
              metric.value
            )}
          </dd>
          <dt className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {metric.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
