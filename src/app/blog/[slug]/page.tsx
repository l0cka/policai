import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
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
    title: `${post.title} - Policai Blog`,
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
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        <Link href="/blog" className="hover:text-primary">Blog</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Post</span>
      </nav>

      <header className="mb-9 border-b border-border pb-7">
        <h1 className="article-title">{post.title}</h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {format(new Date(post.date), 'dd MMMM yyyy')}
        </p>
      </header>

      <article className="prose max-w-none prose-headings:font-display prose-headings:font-medium prose-pre:border prose-pre:border-border">
        <MDXRemote source={post.content} />
      </article>
    </div>
  );
}
