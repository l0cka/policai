import type { PolicyDate } from '@/types';

type Verified = { verification: { status: string } };

/**
 * A record with its verification cut to the status. Source evidence (captures,
 * hashes, review notes) is for the record page; serialised into a list page's
 * client props it outweighed everything shown.
 */
export type StatusOnly<T extends Verified> = Omit<T, 'verification'> & {
  verification: Pick<T['verification'], 'status'>;
};

export function statusOnly<T extends Verified>(record: T): StatusOnly<T> {
  return { ...record, verification: { status: record.verification.status } };
}

export function datesWithoutSources(dates: PolicyDate[]): PolicyDate[] {
  return dates.map(({ source, ...date }) => date);
}
