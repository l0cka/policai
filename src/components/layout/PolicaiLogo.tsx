import Image from 'next/image';
import { cn } from '@/lib/utils';

type PolicaiLogoProps = {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  withWordmark?: boolean;
};

export function PolicaiLogo({
  className,
  iconClassName,
  textClassName,
  withWordmark = true,
}: PolicaiLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span className={cn('relative block shrink-0 h-7 w-7', iconClassName)}>
        <Image
          src="/logo-policai-black.png"
          alt=""
          aria-hidden="true"
          width={128}
          height={128}
          className="block h-full w-full object-contain dark:hidden"
          priority
        />
        <Image
          src="/logo-policai-white.png"
          alt=""
          aria-hidden="true"
          width={128}
          height={128}
          className="hidden h-full w-full object-contain dark:block"
        />
      </span>
      {withWordmark ? (
        <span
          className={cn(
            'font-sans text-lg font-bold uppercase tracking-[0.22em] text-foreground',
            textClassName
          )}
        >
          Policai
        </span>
      ) : null}
    </span>
  );
}
