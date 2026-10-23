'use client';

import { Children, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
      data-running={!reduced && !paused && count > 1 ? 'true' : 'false'}
      style={{ '--analysis-hero-interval': `${ANALYSIS_HERO_INTERVAL_MS}ms` } as CSSProperties}
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
      <div className="analysis-hero-head">
        <p id="analysis-hero-heading" className="analysis-hero-eyebrow">
          Analysis
        </p>
        <div className="flex items-center gap-3 sm:gap-4">
          {count > 1 ? (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <p className="analysis-hero-count max-sm:hidden">
                <span className="sr-only">Showing article </span>
                {current + 1} of {count}
              </p>
              <button
                type="button"
                className="analysis-hero-arrow"
                aria-label="Previous article"
                onClick={() => show(current - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                className="analysis-hero-arrow"
                aria-label="Next article"
                onClick={() => show(current + 1)}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : null}
          <Link href="/analysis" className="analysis-hero-eyebrow whitespace-nowrap hover:text-primary">
            All analysis
          </Link>
          <a
            href="/analysis/feed.xml"
            aria-label="Analysis feed (Atom)"
            className="analysis-hero-eyebrow hover:text-primary max-sm:hidden"
          >
            Feed
          </a>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </p>
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
      {count > 1 ? (
        <div className="analysis-hero-segments" role="group" aria-label="Articles">
          {slides.map((article, slideIndex) => (
            <button
              key={article.slug}
              type="button"
              aria-label={`Show article ${slideIndex + 1}: ${article.title}`}
              aria-current={slideIndex === current ? 'true' : undefined}
              aria-controls={`analysis-hero-slide-${article.slug}`}
              data-state={slideIndex < current ? 'seen' : slideIndex === current ? 'current' : 'ahead'}
              onClick={() => show(slideIndex)}
              className="analysis-hero-segment"
            >
              <span key={slideIndex === current ? current : undefined} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
