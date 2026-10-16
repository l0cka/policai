import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from '@/lib/frontmatter';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description: string;
  content: string;
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'));

  const posts: BlogPost[] = [];

  for (const filename of files) {
    const slug = filename.replace(/\.mdx$/, '');
    const filePath = path.join(BLOG_DIR, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = parseFrontmatter(raw);

    if (!data.title || !data.date || isNaN(new Date(data.date).getTime())) {
      console.warn(`[blog] Skipping ${filename}: missing or invalid frontmatter (title, date)`);
      continue;
    }

    posts.push({
      slug,
      title: data.title,
      date: data.date,
      description: data.description ?? '',
      content,
    });
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = parseFrontmatter(raw);

  if (!data.title || !data.date || isNaN(new Date(data.date).getTime())) {
    return undefined;
  }

  return {
    slug,
    title: data.title,
    date: data.date,
    description: data.description ?? '',
    content,
  };
}
