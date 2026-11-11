import Link from 'next/link';
import { ArticleDate, ArticleThumbnail } from '@/components/analysis';
import { AnalysisHeroCarousel } from '@/components/analysis-hero-carousel';
import type { ArticleView } from '@/lib/data-service';
import { analysisHeroSlides } from '@/lib/analysis-hero';
import { ARTICLE_TYPE_NAMES, type PublishedArticle } from '@/types';

type HeroArticle = ArticleView<PublishedArticle>;

export function AnalysisHero({ articles }: { articles: HeroArticle[] }) {
  const slides = analysisHeroSlides(articles);
  if (slides.length === 0) return null;

  return (
    <AnalysisHeroCarousel slides={slides.map((article) => ({ slug: article.slug, title: article.title }))}>
      {slides.map((article, index) => (
        <div
          key={article.slug}
          className={article.image ? 'analysis-hero-layout' : 'analysis-hero-layout analysis-hero-layout-text'}
        >
          <div className="min-w-0">
            <p className="analysis-hero-meta">
              <span>{ARTICLE_TYPE_NAMES[article.type]}</span>
              <span aria-hidden="true">·</span>
              <ArticleDate date={article.publishedAt} />
              {article.sourceUnderReview ? (
                <span className="text-[var(--caution)]">Source under review</span>
              ) : null}
            </p>
            <p className="analysis-hero-title">
              <Link href={`/analysis/${article.slug}`} prefetch={false} className="hover:text-primary">
                {article.title}
              </Link>
            </p>
            <p className="analysis-hero-teaser">{article.summary}</p>
            <p className="mt-3">
              <Link href={`/analysis/${article.slug}`} prefetch={false} className="analysis-hero-read">
                Read this piece<span aria-hidden="true"> →</span>
              </Link>
            </p>
          </div>
          {article.image ? (
            <div className="analysis-hero-figure" aria-hidden="true">
              <ArticleThumbnail
                image={article.image}
                priority={index === 0}
                sizes="(min-width: 64rem) 208px, 176px"
              />
            </div>
          ) : null}
        </div>
      ))}
    </AnalysisHeroCarousel>
  );
}
