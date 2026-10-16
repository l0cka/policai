'use client';

import { useRef, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_STORAGE_KEY } from '@/components/layout/theme-init';

export type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_EVENT = 'policai:theme';

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> =
  [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'dark', label: 'Dark', Icon: Moon },
  ];

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getSnapshot(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function select(value: ThemeChoice) {
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;

  try {
    if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {}

  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-card/60 p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }, index) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? OPTIONS.length - 1
                    : ['ArrowRight', 'ArrowDown'].includes(event.key)
                      ? (index + 1) % OPTIONS.length
                      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                        ? (index + OPTIONS.length - 1) % OPTIONS.length
                        : null;
              if (next === null) return;
              event.preventDefault();
              select(OPTIONS[next].value);
              buttons.current[next]?.focus();
            }}
            onClick={() => select(value)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-[var(--dur-fast)]',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
          </button>
        );
      })}
    </div>
  );
}
