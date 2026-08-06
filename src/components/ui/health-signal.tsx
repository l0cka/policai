import type { CollectionHealthStatus } from '@/types';
import { cn } from '@/lib/utils';

const SIGNALS: Record<
  CollectionHealthStatus,
  { label: string; color: string; live: boolean }
> = {
  healthy: { label: 'Live', color: 'var(--trust)', live: true },
  degraded: { label: 'Degraded', color: 'var(--caution)', live: false },
  failed: { label: 'Failed', color: 'var(--alarm)', live: false },
};

/**
 * Collection-health indicator. The dot takes the colour of the state it is
 * reporting, and only a healthy run gets the live pulse.
 */
export function HealthSignal({
  health,
  className,
}: {
  health: CollectionHealthStatus;
  className?: string;
}) {
  const signal = SIGNALS[health] ?? SIGNALS.failed;

  return (
    <p
      className={cn(
        'flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em]',
        className,
      )}
      style={{ color: signal.color }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-current',
          signal.live && 'pulse-live',
        )}
      />
      {signal.label}
    </p>
  );
}
