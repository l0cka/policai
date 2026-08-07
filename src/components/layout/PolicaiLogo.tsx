import Image from 'next/image';
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
        <Image
          src="/logo-policai-black.png"
          alt=""
          aria-hidden="true"
          width={128}
          height={128}
          className={cn('block h-full w-full object-contain', imageClassName)}
          priority
        />
      </span>
      {withWordmark ? (
        <span
          className={cn(
            'font-sans text-lg font-semibold uppercase tracking-[0.08em] text-foreground',
            textClassName
          )}
        >
          Policai
        </span>
      ) : null}
    </span>
  );
}
