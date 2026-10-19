import Link from 'next/link';
import { ArticleDate, ArticleThumbnail, ArticleTypeLabel, Byline } from '@/components/analysis';
import { AnalysisHeroCarousel } from '@/components/analysis-hero-carousel';
import type { ArticleView } from '@/lib/data-service';
import { analysisHeroSlides } from '@/lib/analysis-hero';
import type { PublishedArticle } from '@/types';

type HeroArticle = ArticleView<PublishedArticle>;

export function AnalysisHero({ articles }: { articles: HeroArticle[] }) {
  const slides = analysisHeroSlides(articles);
  if (slides.length === 0) return null;

  return (
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
            <p className="analysis-hero-summary">{article.summary}</p>
            <p className="mt-4 flex flex-wrap gap-x-3 font-mono text-[length:var(--type-label)] text-muted-foreground">
              <Byline />
              <ArticleDate date={article.publishedAt} />
              {article.sourceUnderReview ? (
                <span className="text-[var(--caution)]">Source under review</span>
              ) : null}
            </p>
            <p className="mt-5">
              <Link
                href={`/analysis/${article.slug}`}
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                Read this piece
              </Link>
            </p>
          </div>
          {article.image ? (
            <div className="analysis-hero-figure">
              <ArticleThumbnail
                image={article.image}
                sizes="(min-width: 64rem) 360px, (min-width: 40rem) 50vw, 100vw"
              />
            </div>
          ) : null}
        </div>
      ))}
    </AnalysisHeroCarousel>
  );
}
