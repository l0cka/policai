'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 900;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Counts from zero to `value` the first time it scrolls into view.
 *
 * The final value is what renders on the server and on the first client render,
 * so the correct figure is present without JavaScript and for screen readers.
 */
export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || hasRun.current || prefersReducedMotion() || value <= 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasRun.current) return;
        hasRun.current = true;
        observer.disconnect();

        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / DURATION_MS);
          // Ease-out quint, matching --ease-out-quint elsewhere in the UI.
          const eased = 1 - Math.pow(1 - progress, 5);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(step);
        };
        setDisplay(0);
        requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="tabular">
      {display}
    </span>
  );
}
