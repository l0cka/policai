import { describe, expect, it } from 'vitest';
import {
  FOLLOWS_STORAGE_KEY,
  addFollow,
  policiesMatchingFollows,
  readFollows,
  removeFollow,
  type Follow,
} from './follows';

function memoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(FOLLOWS_STORAGE_KEY, initial);
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear() {
      throw new Error('blocked');
    },
    getItem() {
      throw new Error('blocked');
    },
    key() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
}

const policies = [
  { id: 'federal-note', title: 'Federal note', jurisdiction: 'federal', themes: ['legal-practice'] },
  { id: 'nsw-note', title: 'NSW note', jurisdiction: 'nsw', themes: ['public-sector'] },
];

describe('follows', () => {
  it('adds and removes a follow under one storage key', () => {
    const storage = memoryStorage();
    const follow: Follow = { kind: 'policy', id: 'federal-note' };

    expect(addFollow(follow, storage)).toEqual([follow]);
    expect(addFollow(follow, storage)).toEqual([follow]);
    expect(JSON.parse(storage.getItem(FOLLOWS_STORAGE_KEY) ?? '[]')).toEqual([follow]);

    expect(removeFollow(follow, storage)).toEqual([]);
    expect(storage.getItem(FOLLOWS_STORAGE_KEY)).toBeNull();
    expect(removeFollow(follow, storage)).toEqual([]);
  });

  it('matches public records in a followed jurisdiction', () => {
    const storage = memoryStorage();
    addFollow({ kind: 'jurisdiction', id: 'federal' }, storage);

    expect(policiesMatchingFollows(policies, readFollows(storage)).map((policy) => policy.id)).toEqual([
      'federal-note',
    ]);
  });

  it('returns an empty list when storage throws', () => {
    const storage = throwingStorage();

    expect(readFollows(storage)).toEqual([]);
    expect(() => addFollow({ kind: 'policy', id: 'federal-note' }, storage)).not.toThrow();
    expect(readFollows(storage)).toEqual([]);
    expect(() => removeFollow({ kind: 'jurisdiction', id: 'federal' }, storage)).not.toThrow();
    expect(readFollows(storage)).toEqual([]);
  });

  it('drops malformed stored values', () => {
    const storage = memoryStorage('not-json');
    expect(readFollows(storage)).toEqual([]);

    storage.setItem(
      FOLLOWS_STORAGE_KEY,
      JSON.stringify([
        { kind: 'theme', id: 'legal-practice' },
        { kind: 'theme', id: 'not-a-theme' },
        { kind: 'account', id: 'person' },
      ]),
    );
    expect(readFollows(storage)).toEqual([{ kind: 'theme', id: 'legal-practice' }]);
  });
});
