# Blog Page Design Spec

## Overview

Add a blog to Policai for project updates and AI policy commentary. Single author (developer), content stored as MDX files in the repo, parsed at build/request time with gray-matter and rendered with next-mdx-remote.

## Design Change Log

- **2026-04-12:** Replaced Contentlayer2 with gray-matter + next-mdx-remote. Contentlayer2 wraps `next.config.ts` via webpack plugin, which conflicts with Next.js 16's default Turbopack bundler. The raw approach avoids this coupling entirely with no change to the authoring workflow or user-facing design.

## Content Authoring

- Blog posts live in `content/blog/` at the project root
- Each post is a single `.mdx` file named by slug (e.g., `welcome-to-policai.mdx`)
- Frontmatter schema:

```yaml
---
title: string       # Post title (required)
date: string        # ISO date, e.g. "2026-04-11" (required)
description: string # Short excerpt for list page and meta tags (required)
---
```

- MDX allows embedding React components inside Markdown if needed in the future

## Dependencies

- `gray-matter` — Parses YAML frontmatter from MDX files
- `next-mdx-remote` — Renders MDX content in React Server Components
- `@tailwindcss/typography` — Prose styling for rendered Markdown content

## Content Utility

- A utility module at `src/lib/blog.ts` reads MDX files from `content/blog/`, parses frontmatter with gray-matter, and exposes functions to list all posts (sorted by date, newest first) and get a single post by slug.

## Pages & Routing

### `/blog` — Blog List Page

- Server Component at `src/app/blog/page.tsx`
- Displays all posts in reverse chronological order (newest first)
- Each entry shows: title, date (formatted), description
- Uses shadcn/ui Card components for consistent styling with the rest of the site
- Links to individual post pages

### `/blog/[slug]` — Blog Post Page

- Server Component at `src/app/blog/[slug]/page.tsx`
- Looks up post by slug via the blog utility
- Renders MDX content with next-mdx-remote and Tailwind typography prose classes
- Shows title, date, and back-link to `/blog`
- Returns 404 via `notFound()` if slug doesn't match any post

## Navigation

- "Blog" added as the 4th item in the main header navigation, after "Agencies"
- Modification to `src/components/layout/Header.tsx`

## Styling

- Follows existing project patterns: Tailwind CSS utility classes, `cn()` for conditional classes
- Blog list: shadcn/ui Card components matching the policy list card style
- Blog post content: `@tailwindcss/typography` prose classes for readable long-form text
- Light theme, consistent with the IBM Plex color system used across the site

## Configuration

- No `next.config.ts` changes required
- No build plugins or config wrapping needed

## Seed Content

- One initial post (`welcome-to-policai.mdx`) to verify the setup works end-to-end

## Out of Scope

- Comments or user interaction
- Tags, categories, or filtering
- RSS feed
- Search within blog posts
- Multiple authors
