'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  addFollow,
  emptyFollows,
  policiesMatchingFollows,
  policyMatchesFollow,
  readFollows,
  removeFollow,
  subscribeFollows,
  type Follow,
  type FollowablePolicy,
} from '@/lib/follows';
import { getThemeLabel } from '@/lib/themes';
import { getJurisdictionName, getPolicyTypeName, type Jurisdiction, type PolicyType } from '@/types';

export function FollowControl({ follow, label }: { follow: Follow; label: string }) {
  const follows = useSyncExternalStore(subscribeFollows, readFollows, emptyFollows);
  const active = follows.some(
    (item) => item.kind === follow.kind && item.id === follow.id,
  );
  const action = active ? `Unfollow ${label}` : `Follow ${label}`;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        if (active) removeFollow(follow);
        else addFollow(follow);
      }}
      className="inline-flex min-h-11 items-center rounded border border-input px-3 text-xs font-medium text-foreground hover:bg-muted aria-pressed:border-primary/40 aria-pressed:text-primary"
    >
      {action}
    </button>
  );
}

export interface FollowingPolicy extends FollowablePolicy {
  title: string;
  type: PolicyType;
}

function matchNote(policy: FollowingPolicy, follows: readonly Follow[]): string {
  const notes: string[] = [];
  for (const follow of follows) {
    if (!policyMatchesFollow(policy, follow)) continue;
    if (follow.kind === 'policy') notes.push('This record');
    else if (follow.kind === 'jurisdiction') notes.push(getJurisdictionName(follow.id as Jurisdiction));
    else notes.push(getThemeLabel(follow.id));
  }
  return notes.join(' · ');
}

const subscribeNoop = () => () => {};

function useClientReady(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function FollowingList({ policies }: { policies: readonly FollowingPolicy[] }) {
  const ready = useClientReady();
  const follows = useSyncExternalStore(subscribeFollows, readFollows, emptyFollows);

  if (!ready) {
    return (
      <p role="status" className="mt-6 text-sm text-muted-foreground">
        Reading follows saved in this browser.
      </p>
    );
  }

  const matches = policiesMatchingFollows(policies, follows)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'en-AU') || a.id.localeCompare(b.id));

  if (matches.length === 0) {
    return (
      <p role="status" className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
        {follows.length === 0
          ? 'Nothing followed in this browser yet. Follow a record, a jurisdiction, or a theme, then come back to this page.'
          : 'No public records match the follows saved in this browser.'}
      </p>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-border border-y border-border">
      {matches.map((policy) => (
        <li key={policy.id} className="min-w-0 py-4">
          <Link
            href={`/policies/${policy.id}`}
            className="break-words text-base font-medium text-foreground underline-offset-4 hover:underline"
          >
            {policy.title}
          </Link>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {getJurisdictionName(policy.jurisdiction as Jurisdiction)} · {getPolicyTypeName(policy.type)}
            {` · ${matchNote(policy, follows)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
