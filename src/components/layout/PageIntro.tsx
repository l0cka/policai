import type { ReactNode } from 'react';

export function PageIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[clamp(2.65rem,4vw,4rem)] leading-none tracking-[-0.035em]">
            {title}
          </h1>
          <div className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

export function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: number | string }>;
}) {
  return (
    <dl className="grid grid-cols-2 border-b border-border lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={`flex items-baseline justify-center gap-2 py-4 ${
            index % 2 === 1 ? 'border-l border-border' : ''
          } ${index > 1 ? 'border-t border-border lg:border-l lg:border-t-0' : ''}`}
        >
          <dt className="order-2 text-xs text-muted-foreground">{metric.label}</dt>
          <dd className="font-display text-3xl leading-none text-primary">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
