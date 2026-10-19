import { isThemeId, type ThemeId } from '@/lib/themes';
import { JURISDICTIONS, type Jurisdiction } from '@/types';

/** One browser key. Follows are not an account and are not sent to the server. */
export const FOLLOWS_STORAGE_KEY = 'policai.follows';

export type Follow =
  | { kind: 'policy'; id: string }
  | { kind: 'jurisdiction'; id: Jurisdiction }
  | { kind: 'theme'; id: ThemeId };

export interface FollowablePolicy {
  id: string;
  jurisdiction: string;
  themes: readonly string[];
}

const EMPTY_FOLLOWS: Follow[] = [];
const UNSET = Symbol('unset');

let snapshotRaw: string | null | typeof UNSET = UNSET;
let snapshot: Follow[] = EMPTY_FOLLOWS;

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function canonicalFollow(value: unknown): Follow | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { kind?: unknown; id?: unknown };
  if (typeof record.id !== 'string') return null;
  const id = record.id.trim();
  if (!id || id.length > 200) return null;
  if (record.kind === 'policy') return { kind: 'policy', id };
  if (record.kind === 'jurisdiction' && (JURISDICTIONS as readonly string[]).includes(id)) {
    return { kind: 'jurisdiction', id: id as Jurisdiction };
  }
  if (record.kind === 'theme' && isThemeId(id)) return { kind: 'theme', id };
  return null;
}

export function parseFollows(raw: string | null): Follow[] {
  if (!raw) return EMPTY_FOLLOWS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_FOLLOWS;
    const follows: Follow[] = [];
    for (const entry of parsed) {
      const follow = canonicalFollow(entry);
      if (!follow || follows.some((item) => sameFollow(item, follow))) continue;
      follows.push(follow);
      if (follows.length >= 200) break;
    }
    return follows.length ? follows : EMPTY_FOLLOWS;
  } catch {
    return EMPTY_FOLLOWS;
  }
}

export function sameFollow(left: Follow, right: Follow): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function readStored(storage: Storage): Follow[] {
  try {
    return parseFollows(storage.getItem(FOLLOWS_STORAGE_KEY));
  } catch {
    return EMPTY_FOLLOWS;
  }
}

function remember(raw: string | null, follows: Follow[]): Follow[] {
  snapshotRaw = raw;
  snapshot = follows.length ? follows : EMPTY_FOLLOWS;
  return snapshot;
}

/** Reads follows. A storage exception yields an empty list. */
export function readFollows(storage?: Storage): Follow[] {
  const store = storage ?? browserStorage();
  if (!store) return remember(null, EMPTY_FOLLOWS);
  if (storage) return readStored(storage);
  let raw: string | null = null;
  try {
    raw = store.getItem(FOLLOWS_STORAGE_KEY);
  } catch {
    return remember(null, EMPTY_FOLLOWS);
  }
  if (raw === snapshotRaw) return snapshot;
  return remember(raw, parseFollows(raw));
}

function commit(follows: Follow[], storage?: Storage): Follow[] {
  const store = storage ?? browserStorage();
  const next = follows.length ? follows : EMPTY_FOLLOWS;
  if (!store) return storage ? next : remember(null, next);
  let raw: string | null = null;
  try {
    raw = next.length ? JSON.stringify(next) : null;
    if (raw === null) store.removeItem(FOLLOWS_STORAGE_KEY);
    else store.setItem(FOLLOWS_STORAGE_KEY, raw);
  } catch {
    return storage ? readStored(storage) : readFollows();
  }
  if (storage) return next;
  const saved = remember(raw, next);
  for (const listener of listeners) listener();
  return saved;
}

export function addFollow(follow: Follow, storage?: Storage): Follow[] {
  const canonical = canonicalFollow(follow);
  const current = readFollows(storage);
  if (!canonical || current.some((item) => sameFollow(item, canonical))) return current;
  return commit([...current, canonical], storage);
}

export function removeFollow(follow: Follow, storage?: Storage): Follow[] {
  const current = readFollows(storage);
  const next = current.filter((item) => !sameFollow(item, follow));
  if (next.length === current.length) return current;
  return commit(next, storage);
}

export function policyMatchesFollow(policy: FollowablePolicy, follow: Follow): boolean {
  if (follow.kind === 'policy') return policy.id === follow.id;
  if (follow.kind === 'jurisdiction') return policy.jurisdiction === follow.id;
  return policy.themes.includes(follow.id);
}

export function policiesMatchingFollows<T extends FollowablePolicy>(
  policies: readonly T[],
  follows: readonly Follow[],
): T[] {
  if (!follows.length) return [];
  return policies.filter((policy) => follows.some((follow) => policyMatchesFollow(policy, follow)));
}

const listeners = new Set<() => void>();

export function subscribeFollows(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => listeners.delete(listener);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== FOLLOWS_STORAGE_KEY) return;
    snapshotRaw = UNSET;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function emptyFollows(): Follow[] {
  return EMPTY_FOLLOWS;
}
