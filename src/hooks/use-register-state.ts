'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { parseRegisterState, registerParams, updateRegisterState, type RegisterState } from '@/lib/policy-register';

const changeEvent = 'register-state';
function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}
const snapshot = () => window.location.search;
const serverSnapshot = () => '';

export function useRegisterState() {
  const query = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const state = useMemo(() => parseRegisterState(new URLSearchParams(query)), [query]);
  const update = (patch: Partial<RegisterState>) => {
    const url = new URL(window.location.href);
    const next = updateRegisterState(parseRegisterState(url.searchParams), patch);
    for (const key of ['q', 'jurisdiction', 'type', 'status', 'sort', 'view', 'page']) url.searchParams.delete(key);
    registerParams(next).forEach((value, key) => url.searchParams.set(key, value));
    // Retain Next's navigation metadata; typing must not add a history entry per letter.
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new Event(changeEvent));
  };
  return [state, update] as const;
}
