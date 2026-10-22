import { formatPolicyDate } from '@/lib/format-policy-date';
import { progressSteps } from '@/lib/legislation/progress';
import type { Legislative } from '@/lib/legislation/model';
import type { Policy } from '@/types';

export function LegislativeProgress({
  policy,
}: {
  policy: Pick<Policy, 'jurisdiction' | 'dates'> & { legislative: Legislative };
}) {
  const steps = progressSteps(policy);
  return (
    <section aria-labelledby="legislative-progress" className="mt-7 max-w-[44rem]">
      <h2 id="legislative-progress" className="section-title">Progress</h2>
      <ol className="mt-3 border-l border-border">
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`} className="relative pb-4 pl-5 last:pb-0">
            <span
              aria-hidden="true"
              className={
                step.state === 'done'
                  ? 'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--trust)]'
                  : 'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-muted-foreground bg-background'
              }
            />
            {step.state === 'done' ? (
              <>
                <p className="text-sm font-medium leading-6">
                  {step.label}
                  <span className="sr-only">, done</span>
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <time dateTime={step.date}>
                    {formatPolicyDate({ type: 'published', date: step.date, precision: step.precision })}
                  </time>
                  {' · '}
                  <a href={step.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-primary">
                    Source
                  </a>
                </p>
                {step.detail ? <p className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">{step.detail}</p> : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {step.label}
                {step.date ? (
                  <>
                    {', scheduled for '}
                    <time dateTime={step.date}>{formatPolicyDate({ type: 'commenced', date: step.date, precision: 'day' })}</time>
                  </>
                ) : null}
                <span className="sr-only">, not yet</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
