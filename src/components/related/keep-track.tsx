import Link from 'next/link';
import { FollowControl } from '@/components/follow-control';
import type { LabelledFollow } from '@/lib/next-step';

export function KeepTrack({
  follows,
  feed,
}: {
  follows: LabelledFollow[];
  feed: { href: string; label: string };
}) {
  return (
    <section aria-labelledby="keep-track" className="mt-8 max-w-[44rem] border-t border-[var(--rule-heavy)] pt-5">
      <h2 id="keep-track" className="section-title">
        Keep track
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Follow to gather the records on your{' '}
        <Link href="/following" className="text-primary underline underline-offset-4">
          Following
        </Link>{' '}
        page. Follows stay in this browser and nothing is emailed.
      </p>
      {follows.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {follows.map(({ follow, label }) => (
            <FollowControl key={`${follow.kind}:${follow.id}`} follow={follow} label={label} />
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-sm">
        <a href={feed.href} className="text-primary underline underline-offset-4">
          {feed.label}
        </a>
      </p>
    </section>
  );
}
