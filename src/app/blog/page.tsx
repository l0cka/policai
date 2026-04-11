import { getAllPosts } from '@/lib/blog'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Blog — Policai',
  description: 'Project updates and AI policy commentary from Policai.',
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-muted-foreground mb-8">
        Project updates and commentary on Australian AI policy developments.
      </p>
      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts yet. Check back soon.</p>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{post.title}</CardTitle>
                  <CardDescription>{format(new Date(post.date), 'MMMM d, yyyy')}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span>{post.description}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 ml-4" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
