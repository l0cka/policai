import {
  developmentRevisionHash,
  policyRevisionHash,
  timelineRevisionHash,
} from '@/lib/policy-revision';
import { isPubliclyEstablished } from '@/lib/verification';
import type { Development, Policy, TimelineEvent } from '@/types';

/**
 * Published records: what the public read path (`data-service.ts`) serves as
 * editorially verified. A policy or timeline event is published when it is
 * not trashed and its verification is publicly established. A development is
 * published only when it is also editorially verified: collector detections
 * are served too, but labelled "Needs review" as machine output.
 *
 * Withholding for a pending update review is left out on purpose. It is
 * temporary, and the record returns to readers as it stands.
 */
export function isPublicPolicy(policy: Policy, now: Date): boolean {
  return policy.status !== 'trashed' && isPubliclyEstablished(policy.verification, now);
}

export function isPublicTimelineEvent(event: TimelineEvent, now: Date): boolean {
  return isPubliclyEstablished(event.verification, now);
}

export function isPublishedDevelopment(development: Development, now: Date): boolean {
  return development.status !== 'dismissed' && isPubliclyEstablished(development.verification, now);
}

/** Later than any verification date, so a future-dated check still counts as published. */
const ANY_TIME = new Date(8.64e15);

export interface PublishedRecordFiles {
  policies: Policy[];
  timeline: TimelineEvent[];
  developments: Development[];
}

export interface PublishedRecordRule<R> {
  isPublished(record: R): boolean;
  /**
   * Hash of what a reader sees of the record: its editorial revision, which
   * leaves out the source audit time and retrieval metadata that change
   * mechanically.
   */
  readerContent(record: R): string;
}

export const PUBLISHED_RECORDS: { [File in keyof PublishedRecordFiles]: PublishedRecordRule<PublishedRecordFiles[File][number]> } = {
  policies: { isPublished: (policy) => isPublicPolicy(policy, ANY_TIME), readerContent: policyRevisionHash },
  timeline: { isPublished: (event) => isPublicTimelineEvent(event, ANY_TIME), readerContent: timelineRevisionHash },
  developments: {
    isPublished: (development) => isPublishedDevelopment(development, ANY_TIME),
    readerContent: developmentRevisionHash,
  },
};
