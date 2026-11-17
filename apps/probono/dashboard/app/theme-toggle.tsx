'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from './icons';
import { THEME_STORAGE_KEY } from './theme-init';

export type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_EVENT = 'probono-radar:theme';

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

const KEY_TARGETS: Record<string, (index: number) => number> = {
  ArrowLeft: (index) => index - 1,
  ArrowUp: (index) => index - 1,
  ArrowRight: (index) => index + 1,
  ArrowDown: (index) => index + 1,
  Home: () => 0,
  End: () => OPTIONS.length - 1,
};

/**
 * The `<html>` element is the single source of truth: the init script sets it
 * before hydration and `select` updates it. Reading from the DOM rather than
 * from component state keeps every toggle on the page in agreement.
 */
function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getSnapshot(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

// The server cannot know the visitor's stored choice, so it renders the system
// option; hydration then swaps in the real one.
function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function select(value: ThemeChoice) {
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;

  try {
    if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The choice
    // still applies for this page view, it just will not persist.
  }

  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function ThemeToggle({
  label = 'Colour theme',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className={className ? `theme-toggle ${className}` : 'theme-toggle'} role="radiogroup" aria-label={label}>
      {OPTIONS.map(({ value, label: option, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={option}
          title={option}
          tabIndex={choice === value ? 0 : -1}
          onClick={() => select(value)}
          onKeyDown={(event) => {
            const target = KEY_TARGETS[event.key];
            if (!target) return;
            event.preventDefault();
            const currentIndex = OPTIONS.findIndex((option) => option.value === value);
            const nextIndex = (target(currentIndex) + OPTIONS.length) % OPTIONS.length;
            select(OPTIONS[nextIndex].value);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
              [nextIndex]?.focus();
          }}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
