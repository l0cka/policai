import { getAllPosts } from '@/lib/blog';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageIntro } from '@/components/layout';

export const metadata = {
  title: 'Blog — Policai',
  description: 'Project updates and AI policy commentary from Policai.',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Research notes"
        description="Project updates, methodology notes and commentary on Australian AI policy developments."
      />
      {posts.length === 0 ? (
        <p className="py-12 text-sm text-muted-foreground">No posts yet. Check back soon.</p>
      ) : (
        <div className="mx-auto max-w-5xl py-7">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group grid gap-3 border-b border-border py-6 transition-colors hover:bg-[var(--row-hover)] sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:px-3"
            >
              <time className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {format(new Date(post.date), 'dd MMMM yyyy')}
              </time>
              <span>
                <span className="block font-display text-2xl group-hover:text-primary">{post.title}</span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">{post.description}</span>
              </span>
              <ArrowRight className="h-5 w-5 self-center text-primary" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
