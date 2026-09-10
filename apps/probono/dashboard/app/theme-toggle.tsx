'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from './icons';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'probono-radar-theme';

const THEME_EVENT = 'probono-radar:theme';

/**
 * Runs before first paint so a stored choice is applied without a flash of the
 * system theme. Kept as a string because it is injected via
 * `dangerouslySetInnerHTML` in the root layout.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})();`;

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

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

export default function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          title={label}
          tabIndex={choice === value ? 0 : -1}
          onClick={() => select(value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const currentIndex = OPTIONS.findIndex((option) => option.value === value);
            const next = OPTIONS[(currentIndex + direction + OPTIONS.length) % OPTIONS.length];
            select(next.value);
            const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
              '[role="radio"]',
            );
            radios?.[(currentIndex + direction + OPTIONS.length) % OPTIONS.length]?.focus();
          }}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
