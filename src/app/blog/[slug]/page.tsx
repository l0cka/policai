import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getAllPosts, getPostBySlug } from '@/lib/blog';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} — Policai Blog`,
    description: post.description,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Blog
      </Link>

      <header className="mb-9 border-b border-border pb-7">
        <h1 className="font-display text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] tracking-[-0.035em]">{post.title}</h1>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {format(new Date(post.date), 'MMMM d, yyyy')}
        </p>
      </header>

      <article className="prose prose-slate max-w-none prose-headings:font-display prose-headings:font-medium prose-a:text-primary">
        <MDXRemote source={post.content} />
      </article>
    </div>
  );
}
