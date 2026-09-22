import { cn } from '@/lib/utils';

type PolicaiLogoProps = {
  className?: string;
  iconClassName?: string;
  imageClassName?: string;
  textClassName?: string;
  withWordmark?: boolean;
};

export function PolicaiLogo({
  className,
  iconClassName,
  imageClassName,
  textClassName,
  withWordmark = true,
}: PolicaiLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('relative block h-7 w-7 shrink-0', iconClassName)}>
        {/* Companion SVG from the selected editorial identity study. */}
        <svg
          viewBox="0 0 64 76"
          fill="currentColor"
          aria-hidden="true"
          className={cn('block h-full w-full', imageClassName)}
        >
          <path d="M5 17 35 2v8L12 22v45l-7-4z" />
          <path d="M17 23 45 9v10L26 29v43l-9 4z" />
          <path d="M46 24c13 0 19 10 17 22-2 12-11 17-22 17H30l10-8c4-3 6-7 6-12z" />
        </svg>
      </span>
      {withWordmark ? (
        <span
          className={cn(
            'font-sans text-[1.9rem] font-bold tracking-[-0.06em] text-foreground',
            textClassName,
          )}
        >
          policai
        </span>
      ) : null}
    </span>
  );
}
