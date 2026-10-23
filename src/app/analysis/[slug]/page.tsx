import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArticleBreadcrumb,
  ArticleDate,
  ArticleLeadImage,
  Byline,
  CitedRecords,
  SourceUnderReviewBanner,
  StandardNotices,
} from '@/components/analysis';
import { ArticleFigureView } from '@/components/article-figures';
import { ArticleTable } from '@/components/article-table';
import { renderArticleMarkdown } from '@/lib/article-markdown';
import { getArticleBySlug, type ArticleView } from '@/lib/data-service';
import { ARTICLE_BYLINE, articleEditorialDate } from '@/lib/articles';
import { metaDescription, pageAlternates, SITE_SHARE_IMAGE, SITE_URL } from '@/lib/site-seo';
import { ARTICLE_TYPE_NAMES, type ArticleImage, type PublishedArticle } from '@/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

function imageUrl(image: ArticleImage) {
  return { url: `${SITE_URL}${image.src}`, width: image.width, height: image.height, alt: image.alt };
}

function imageJsonLd(image: ArticleImage) {
  return {
    '@type': 'ImageObject',
    url: `${SITE_URL}${image.src}`,
    width: image.width,
    height: image.height,
    caption: image.alt,
    license: image.licenceUrl,
    creditText: `${image.title} by ${image.creator}`,
    acquireLicensePage: image.sourceUrl,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: 'Analysis not found' };
  if (article.status === 'withdrawn') {
    return {
      title: `Withdrawn: ${article.title}`,
      robots: { index: false },
    };
  }
  const description = metaDescription(article.summary);
  const images = [article.image ? imageUrl(article.image) : SITE_SHARE_IMAGE];
  return {
    title: article.title,
    description,
    alternates: pageAlternates(`/analysis/${article.slug}`),
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/analysis/${article.slug}`,
      title: article.title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      images,
    },
  };
}

function articleJsonLd(article: ArticleView<PublishedArticle>): string {
  const publisher = { '@type': 'Organization', name: ARTICLE_BYLINE, url: SITE_URL };
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    url: `${SITE_URL}/analysis/${article.slug}`,
    datePublished: article.publishedAt,
    dateModified: articleEditorialDate(article),
    articleSection: ARTICLE_TYPE_NAMES[article.type],
    ...(article.image ? { image: imageJsonLd(article.image) } : {}),
    author: publisher,
    publisher,
    citation: [
      ...article.citations
        .filter((citation) => citation.state !== 'not_public')
        .map((citation) => `${SITE_URL}/policies/${citation.policyId}`),
      ...article.sources,
    ],
  }).replace(/</g, '\\u003c');
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  if (article.status === 'withdrawn') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <ArticleBreadcrumb type={article.type} />
        <h1 className="article-title">{article.title}</h1>
        <div role="status" className="mt-6 border-l-2 border-[var(--caution)] bg-[var(--status-proposed-bg)] px-4 py-3 text-sm">
          <p className="font-medium text-[var(--caution)]">
            <ArticleDate label="Withdrawn on" date={article.withdrawnAt} />
          </p>
          <p className="mt-1 leading-6">{article.withdrawnReason}</p>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          <Byline /> · <ArticleDate label="First published" date={article.publishedAt} />
        </p>
        <p className="mt-6 text-sm">
          <Link href="/analysis" className="text-primary underline underline-offset-4 hover:no-underline">
            All analysis
          </Link>
        </p>
      </div>
    );
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(article) }} />
      <ArticleBreadcrumb type={article.type} />
      <header className="space-y-3">
        <h1 className="article-title">{article.title}</h1>
        <p className="text-base leading-7 text-muted-foreground">{article.summary}</p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <Byline />
          <ArticleDate label="Published" date={article.publishedAt} />
          {article.updatedAt ? <ArticleDate label="Updated" date={article.updatedAt} /> : null}
        </p>
      </header>

      {article.image ? <ArticleLeadImage image={article.image} /> : null}

      <div className="mt-6 space-y-6">
        {article.sourceUnderReview ? <SourceUnderReviewBanner /> : null}
        <StandardNotices />
      </div>

      <div className="prose article-body mt-8 max-w-none dark:prose-invert">
        {article.blocks.map((block, index) =>
          block.kind === 'prose' ? (
            <Fragment key={index}>
              {renderArticleMarkdown(block.markdown, { components: { table: ArticleTable } })}
            </Fragment>
          ) : (
            <ArticleFigureView
              key={index}
              number={block.number}
              figure={block.figure}
              citations={article.citations}
              chart={article.registerCharts[block.number]}
            />
          ),
        )}
      </div>

      {article.corrections.length > 0 ? (
        <section className="mt-10" aria-labelledby="corrections">
          <h2 id="corrections" className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
            Corrections and updates
          </h2>
          <ol className="mt-3 space-y-3 text-sm">
            {article.corrections.map((correction) => (
              <li key={`${correction.date}-${correction.text}`} className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <span className="text-xs font-medium text-muted-foreground tabular">
                  <ArticleDate date={correction.date} />
                </span>
                <span className="leading-6">{correction.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="cited-records">
        <h2 id="cited-records" className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
          Cited register records
        </h2>
        <div className="mt-3">
          <CitedRecords citations={article.citations} />
        </div>
      </section>

      {article.sources.length > 0 ? (
        <section className="mt-8" aria-labelledby="official-sources">
          <h2 id="official-sources" className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
            Official sources
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {article.sources.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-4 hover:no-underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
