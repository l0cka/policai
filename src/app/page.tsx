import Link from 'next/link';
import { Map, FileText, ArrowRight, Building2, MapPin, CheckCircle2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HomeSearch } from '@/components/home-search';
import {
  JURISDICTION_NAMES,
  POLICY_STATUS_NAMES,
  type Jurisdiction,
  type PolicyStatus,
} from '@/types';

import policiesData from '@/../public/data/sample-policies.json';
import agenciesData from '@/../public/data/sample-agencies.json';

// Calculate stats from sample data
const stats = {
  policies: policiesData.length,
  agencies: agenciesData.length,
  jurisdictions: new Set(policiesData.map((p) => p.jurisdiction)).size,
  activePolicies: policiesData.filter((p) => p.status === 'active').length,
};

const statusColors: Record<string, string> = {
  proposed: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700',
  active: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700',
  amended: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
  repealed: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600',
};

// Get recent policies sorted by updatedAt
const recentPolicies = [...policiesData]
  .filter((p) => p.status !== 'trashed')
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  .slice(0, 5);

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Tracking Australian AI Policy
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Navigate Australia&apos;s{' '}
              <span className="text-primary">AI Policy Landscape</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              Search and explore AI policy, regulation, and governance
              developments across federal and state jurisdictions.
            </p>

            {/* Search Bar */}
            <div className="mt-8 mx-auto max-w-2xl">
              <HomeSearch />
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/policies">
                  <FileText className="mr-2 h-5 w-5" />
                  Browse All Policies
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/map">
                  <Map className="mr-2 h-5 w-5" />
                  Explore by State
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/30 py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.policies}</div>
              <div className="text-sm text-muted-foreground">Policies Tracked</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.agencies}</div>
              <div className="text-sm text-muted-foreground">Agencies</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.jurisdictions}</div>
              <div className="text-sm text-muted-foreground">Jurisdictions</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.activePolicies}</div>
              <div className="text-sm text-muted-foreground">Active Policies</div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Policies Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">Recent Policies</h2>
              <p className="mt-1 text-muted-foreground">
                Latest AI policy developments across Australia
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/policies">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {recentPolicies.map((policy) => (
              <Link
                key={policy.id}
                href={`/policies/${policy.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate mb-1">{policy.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColors[policy.status] || ''}`}
                    >
                      {POLICY_STATUS_NAMES[policy.status as PolicyStatus]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction]}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(policy.effectiveDate).toLocaleDateString('en-AU', {
                        year: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
