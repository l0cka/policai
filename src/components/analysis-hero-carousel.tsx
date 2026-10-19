'use client';

import { Children, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ANALYSIS_HERO_INTERVAL_MS,
  analysisHeroIndex,
  type AnalysisHeroSlideMeta,
} from '@/lib/analysis-hero';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AnalysisHeroCarousel({
  slides,
  children,
}: {
  slides: readonly AnalysisHeroSlideMeta[];
  children: ReactNode;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [notice, setNotice] = useState('');
  const paused = hovered || focused;
  const current = analysisHeroIndex(index, 0, count);
  const panels = Children.toArray(children);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (reduced || paused || count < 2 || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setIndex((value) => analysisHeroIndex(value, 1, count));
    }, ANALYSIS_HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, paused, reduced]);

  const show = (next: number) => {
    const resolved = analysisHeroIndex(next, 0, count);
    setIndex(resolved);
    const article = slides[resolved];
    setNotice(`${article.title}. Article ${resolved + 1} of ${count}.`);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-labelledby="analysis-hero-heading"
      className="analysis-hero"
      data-reduced-motion={reduced ? 'true' : 'false'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocused(false);
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule-heavy)] py-2 font-mono text-[length:var(--type-label)] font-medium uppercase tracking-[var(--tracking-eyebrow)]">
        <h2 id="analysis-hero-heading">Analysis</h2>
        <div className="flex gap-4">
          <Link href="/analysis" className="hover:text-primary">
            All analysis
          </Link>
          <a href="/analysis/feed.xml" aria-label="Analysis feed (Atom)" className="hover:text-primary">
            Analysis feed
          </a>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </p>
      <div className="analysis-hero-controls">
        <p className="font-mono text-[length:var(--type-label)] uppercase tracking-[var(--tracking-eyebrow)] text-muted-foreground">
          <span className="sr-only">Showing article </span>
          <span>
            {current + 1} of {count}
          </span>
        </p>
        {count > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center" role="group" aria-label="Articles">
              {slides.map((article, slideIndex) => {
                const active = slideIndex === current;
                return (
                  <button
                    key={article.slug}
                    type="button"
                    aria-label={`Show article ${slideIndex + 1}: ${article.title}`}
                    aria-current={active ? 'true' : undefined}
                    aria-controls={`analysis-hero-slide-${article.slug}`}
                    onClick={() => show(slideIndex)}
                    className="analysis-hero-dot"
                  >
                    <span aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="analysis-hero-control"
              aria-label="Previous article"
              onClick={() => show(current - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="analysis-hero-control"
              aria-label="Next article"
              onClick={() => show(current + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
      <div className="analysis-hero-stage">
        {panels.map((panel, slideIndex) => {
          const active = slideIndex === current;
          const slide = slides[slideIndex];
          return (
            <div
              key={slide.slug}
              id={`analysis-hero-slide-${slide.slug}`}
              className="analysis-hero-slide"
              data-current={active ? 'true' : 'false'}
              aria-hidden={active ? undefined : true}
              inert={active ? undefined : true}
            >
              {panel}
            </div>
          );
        })}
      </div>
    </section>
  );
}
