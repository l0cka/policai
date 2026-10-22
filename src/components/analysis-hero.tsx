import Link from 'next/link';
import { ArticleDate, ArticleThumbnail, ArticleTypeLabel } from '@/components/analysis';
import { AnalysisHeroCarousel } from '@/components/analysis-hero-carousel';
import type { ArticleView } from '@/lib/data-service';
import { analysisHeroSlides } from '@/lib/analysis-hero';
import type { PublishedArticle } from '@/types';

type HeroArticle = ArticleView<PublishedArticle>;

export function AnalysisHero({ articles }: { articles: HeroArticle[] }) {
  const slides = analysisHeroSlides(articles);
  if (slides.length === 0) return null;

  return (
    <>
      <style>{`
      .analysis-hero.analysis-hero {
        margin-bottom: var(--space-4);
        padding-block: var(--space-2);
      }
      .analysis-hero-slide.analysis-hero-slide {
        padding-block: var(--space-3) 0;
      }
      .analysis-hero-controls.analysis-hero-controls {
        margin-top: var(--space-1);
      }
      .analysis-hero-title.analysis-hero-title {
        font-size: clamp(1.15rem, 0.95rem + 0.7vw, 1.5rem);
        -webkit-line-clamp: 1;
      }
      .analysis-hero-teaser.analysis-hero-teaser {
        margin-top: var(--space-1);
      }
      .analysis-hero > .flex {
        padding-block: 0;
      }
      `}</style>
      <AnalysisHeroCarousel slides={slides.map((article) => ({ slug: article.slug, title: article.title }))}>
        {slides.map((article) => (
          <div
            key={article.slug}
            className={article.image ? 'analysis-hero-layout' : 'analysis-hero-layout analysis-hero-layout-text'}
          >
            <div className="min-w-0">
              <ArticleTypeLabel type={article.type} />
              <h3 className="analysis-hero-title">
                <Link href={`/analysis/${article.slug}`} className="hover:text-primary">
                  {article.title}
                </Link>
              </h3>
              <p className="analysis-hero-teaser">{article.summary}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[length:var(--type-label)] text-muted-foreground">
                <ArticleDate date={article.publishedAt} />
                {article.sourceUnderReview ? (
                  <span className="text-[var(--caution)]">Source under review</span>
                ) : null}
                <Link
                  href={`/analysis/${article.slug}`}
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  Read this piece
                </Link>
              </p>
            </div>
            {article.image ? (
              <div className="analysis-hero-figure" aria-hidden="true">
                <ArticleThumbnail
                  image={article.image}
                  sizes="(min-width: 64rem) 160px, 120px"
                />
              </div>
            ) : null}
          </div>
        ))}
      </AnalysisHeroCarousel>
    </>
  );
}
