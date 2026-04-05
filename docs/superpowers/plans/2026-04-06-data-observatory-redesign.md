# Data Observatory Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Policai from a marketing-style app into a utilitarian data observatory with sidebar+table layouts, IBM Plex typography, and light-mode-only theme.

**Architecture:** Pure visual redesign — no API, type, or business logic changes. Replace the hero-based homepage with a policy browser (sidebar filters + data table). Strip all pages to the same sidebar+main pattern. Remove dark mode entirely.

**Tech Stack:** Next.js App Router, Tailwind CSS 4, IBM Plex Sans/Mono (Google Fonts), existing shadcn/ui components where useful (Select, Dialog, Sheet), custom table component.

---

## File Structure

### New files:
- `src/components/policy-table.tsx` — Reusable sortable policy data table
- `src/components/filter-sidebar.tsx` — Reusable sidebar with filters and summary stats

### Major rewrites:
- `src/app/globals.css` — Light-only color system, IBM Plex font imports
- `src/app/layout.tsx` — Remove ThemeProvider, add Google Fonts
- `src/app/page.tsx` — Replace hero with policy browser (sidebar + table)
- `src/components/layout/Header.tsx` — Stripped wordmark + text nav
- `src/components/layout/Footer.tsx` — Single-line footer
- `src/app/policies/page.tsx` — Redirect to `/`
- `src/app/policies/[id]/page.tsx` — Restyle breadcrumb and wrapper
- `src/app/policies/[id]/policy-detail-tabs.tsx` — Restyle tabs, metadata, remove badges
- `src/app/map/page.tsx` — Sidebar layout, remove stat cards
- `src/app/agencies/page.tsx` — Table layout, remove stat cards

### Delete:
- `src/components/theme-toggle.tsx`
- `src/components/theme-provider.tsx`
- `src/components/home-search.tsx`

### Leave unchanged:
- `src/app/admin/` (internal pages)
- `src/app/api/` (backend)
- `src/lib/`, `src/types/`, `src/contexts/`
- `src/app/network/`, `src/app/framework/`, `src/app/timeline/` (not in main nav)
- `src/components/visualizations/AustraliaMap.tsx` (SVG map component)

---

### Task 1: Theme Foundation — globals.css and layout.tsx

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Delete: `src/components/theme-toggle.tsx`
- Delete: `src/components/theme-provider.tsx`

- [ ] **Step 1: Replace globals.css with light-only theme**

Replace the entire content of `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
}

:root {
  --radius: 0.375rem;
  --background: #f8f7f5;
  --foreground: #1a1a1a;
  --card: #ffffff;
  --card-foreground: #1a1a1a;
  --popover: #ffffff;
  --popover-foreground: #1a1a1a;
  --primary: #1e40af;
  --primary-foreground: #ffffff;
  --secondary: #f0efed;
  --secondary-foreground: #1a1a1a;
  --muted: #f0efed;
  --muted-foreground: #666666;
  --accent: #f0efed;
  --accent-foreground: #1a1a1a;
  --destructive: #dc2626;
  --border: #d4d4d4;
  --input: #d4d4d4;
  --ring: #1e40af;
  --chart-1: #1e40af;
  --chart-2: #16a34a;
  --chart-3: #d97706;
  --chart-4: #7c3aed;
  --chart-5: #dc2626;
  --sidebar: #f0efed;
  --sidebar-foreground: #1a1a1a;
  --sidebar-primary: #1e40af;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e5e4e1;
  --sidebar-accent-foreground: #1a1a1a;
  --sidebar-border: #d4d4d4;
  --sidebar-ring: #1e40af;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
}
```

Remove the `.dark {}` block, `@custom-variant dark`, all animation keyframes (we'll add back only if needed), and all ReactFlow CSS overrides (the network page is out of scope).

- [ ] **Step 2: Update layout.tsx — remove ThemeProvider, add IBM Plex fonts**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Policai — Australian AI Policy Tracker',
  description:
    'Search and browse Australian AI policy, regulation, and governance developments across federal and state jurisdictions.',
  keywords: [
    'Australian AI policy',
    'AI regulation',
    'artificial intelligence',
    'government policy',
    'AI governance Australia',
  ],
  metadataBase: new URL('https://policai.com.au'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          <TooltipProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Delete theme-toggle.tsx and theme-provider.tsx**

```bash
rm src/components/theme-toggle.tsx src/components/theme-provider.tsx
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

Expected: May show errors from Header.tsx still importing ThemeToggle — that's fine, we fix it in Task 2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace theme with light-only IBM Plex color system"
```

---

### Task 2: Header — Stripped Wordmark + Text Nav

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Rewrite Header.tsx**

Replace `src/components/layout/Header.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/', label: 'Policies' },
  { href: '/map', label: 'Map' },
  { href: '/agencies', label: 'Agencies' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/policies');
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-foreground bg-background">
      <div className="container mx-auto flex h-12 items-center px-4">
        <Link href="/" className="font-sans text-lg font-bold tracking-wide uppercase">
          Policai
        </Link>

        <nav className="ml-8 hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
                isActive(item.href)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {!isLoading && (
            <>
              {user ? (
                <div className="hidden md:flex items-center gap-3">
                  <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
                    Admin
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/admin/login"
                  className="hidden md:block text-sm text-muted-foreground hover:text-foreground"
                >
                  Admin
                </Link>
              )}
            </>
          )}

          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[250px]">
              <nav className="flex flex-col gap-1 mt-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded transition-colors',
                      isActive(item.href)
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                {user ? (
                  <>
                    <Link href="/admin" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                      Admin
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link href="/admin/login" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Admin
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

Expected: No new errors from Header (may still have pre-existing errors elsewhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "feat: redesign header as stripped wordmark with text nav"
```

---

### Task 3: Footer — Single Line

**Files:**
- Modify: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Rewrite Footer.tsx**

Replace `src/components/layout/Footer.tsx` with:

```tsx
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Policai</span>
          <span className="hidden sm:inline">&middot;</span>
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <span className="hidden sm:inline">&middot;</span>
          <Link href="/methodology" className="hover:text-foreground transition-colors">Methodology</Link>
          <span className="hidden sm:inline">&middot;</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Footer.tsx
git commit -m "feat: simplify footer to single-line institutional style"
```

---

### Task 4: Filter Sidebar Component

**Files:**
- Create: `src/components/filter-sidebar.tsx`

- [ ] **Step 1: Create the reusable filter sidebar**

Write `src/components/filter-sidebar.tsx`:

```tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterConfig {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface SummaryStat {
  label: string;
  value: number;
}

interface FilterSidebarProps {
  filters: FilterConfig[];
  summary?: SummaryStat[];
  onClear?: () => void;
  hasActiveFilters?: boolean;
}

export function FilterSidebar({ filters, summary, onClear, hasActiveFilters }: FilterSidebarProps) {
  return (
    <aside className="w-full lg:w-60 flex-shrink-0">
      <div className="sticky top-16">
        <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
          Filters
        </div>

        <div className="space-y-4">
          {filters.map((filter) => (
            <div key={filter.id}>
              <label className="font-mono text-xs text-muted-foreground mb-1.5 block">
                {filter.label}
              </label>
              <Select value={filter.value} onValueChange={filter.onChange}>
                <SelectTrigger className="h-8 text-sm rounded bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {hasActiveFilters && onClear && (
          <button
            onClick={onClear}
            className="mt-3 font-mono text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}

        {summary && summary.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Summary
            </div>
            <div className="space-y-1.5">
              {summary.map((stat) => (
                <div key={stat.label} className="font-mono text-xs">
                  <span className="font-semibold text-foreground">{stat.value}</span>{' '}
                  <span className="text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/filter-sidebar.tsx
git commit -m "feat: add reusable filter sidebar component"
```

---

### Task 5: Policy Table Component

**Files:**
- Create: `src/components/policy-table.tsx`

- [ ] **Step 1: Create the sortable policy data table**

Write `src/components/policy-table.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Jurisdiction,
  type PolicyType,
  type PolicyStatus,
} from '@/types';

interface PolicyRow {
  id: string;
  title: string;
  jurisdiction: string;
  type: string;
  status: string;
  effectiveDate: string;
}

type SortField = 'title' | 'jurisdiction' | 'type' | 'status' | 'effectiveDate';
type SortDirection = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-700',
  proposed: 'text-amber-600',
  amended: 'text-blue-700',
  repealed: 'text-gray-500',
};

function SortIndicator({ field, current, direction }: { field: SortField; current: SortField; direction: SortDirection }) {
  if (field !== current) return <span className="text-transparent ml-1">&uarr;</span>;
  return <span className="ml-1">{direction === 'asc' ? '\u2191' : '\u2193'}</span>;
}

interface PolicyTableProps {
  policies: PolicyRow[];
}

export function PolicyTable({ policies }: PolicyTableProps) {
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...policies].sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  };

  const columns: { key: SortField; label: string; className: string }[] = [
    { key: 'title', label: 'Policy', className: 'text-left' },
    { key: 'jurisdiction', label: 'Jurisdiction', className: 'text-left hidden md:table-cell' },
    { key: 'type', label: 'Type', className: 'text-left hidden lg:table-cell' },
    { key: 'status', label: 'Status', className: 'text-left' },
    { key: 'effectiveDate', label: 'Date', className: 'text-left hidden sm:table-cell' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.className} py-2 pr-4 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <SortIndicator field={col.key} current={sortField} direction={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((policy) => (
            <tr key={policy.id} className="border-b border-border hover:bg-[#f0efed] transition-colors">
              <td className="py-3 pr-4">
                <Link
                  href={`/policies/${policy.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {policy.title}
                </Link>
                {/* Mobile: show metadata below title */}
                <div className="md:hidden mt-1 font-mono text-xs text-muted-foreground">
                  {JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction] || policy.jurisdiction}
                  {' \u00b7 '}
                  {POLICY_TYPE_NAMES[policy.type as PolicyType] || policy.type}
                </div>
              </td>
              <td className="py-3 pr-4 text-sm text-muted-foreground hidden md:table-cell">
                {JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction] || policy.jurisdiction}
              </td>
              <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
                {POLICY_TYPE_NAMES[policy.type as PolicyType] || policy.type}
              </td>
              <td className={`py-3 pr-4 text-sm font-medium ${STATUS_COLORS[policy.status] || 'text-muted-foreground'}`}>
                {POLICY_STATUS_NAMES[policy.status as PolicyStatus] || policy.status}
              </td>
              <td className="py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                {formatDate(policy.effectiveDate)}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No policies match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/policy-table.tsx
git commit -m "feat: add sortable policy data table component"
```

---

### Task 6: Homepage — Policy Browser

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/components/home-search.tsx`

- [ ] **Step 1: Rewrite the homepage as a policy browser**

Replace `src/app/page.tsx` with:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { FilterSidebar } from '@/components/filter-sidebar';
import { PolicyTable } from '@/components/policy-table';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
} from '@/types';

import policiesData from '@/../public/data/sample-policies.json';

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasActiveFilters = jurisdictionFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setJurisdictionFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const filteredPolicies = useMemo(() => {
    return policiesData
      .filter((p) => p.status !== 'trashed')
      .filter((p) => {
        const matchesSearch =
          search === '' ||
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
        const matchesJurisdiction = jurisdictionFilter === 'all' || p.jurisdiction === jurisdictionFilter;
        const matchesType = typeFilter === 'all' || p.type === typeFilter;
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesJurisdiction && matchesType && matchesStatus;
      });
  }, [search, jurisdictionFilter, typeFilter, statusFilter]);

  const allPolicies = policiesData.filter((p) => p.status !== 'trashed');
  const jurisdictions = new Set(allPolicies.map((p) => p.jurisdiction));

  const filters = [
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      value: jurisdictionFilter,
      onChange: setJurisdictionFilter,
      options: [
        { value: 'all', label: 'All jurisdictions' },
        ...Object.entries(JURISDICTION_NAMES).map(([k, v]) => ({ value: k, label: v })),
      ],
    },
    {
      id: 'type',
      label: 'Type',
      value: typeFilter,
      onChange: setTypeFilter,
      options: [
        { value: 'all', label: 'All types' },
        ...Object.entries(POLICY_TYPE_NAMES).map(([k, v]) => ({ value: k, label: v })),
      ],
    },
    {
      id: 'status',
      label: 'Status',
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: 'All statuses' },
        ...Object.entries(POLICY_STATUS_NAMES)
          .filter(([k]) => k !== 'trashed')
          .map(([k, v]) => ({ value: k, label: v })),
      ],
    },
  ];

  const summary = [
    { label: 'policies', value: filteredPolicies.length },
    { label: 'jurisdictions', value: jurisdictions.size },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col lg:flex-row gap-8">
        <FilterSidebar
          filters={filters}
          summary={summary}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        <div className="flex-1 min-w-0">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-2 text-sm bg-transparent border-b border-border focus:border-foreground focus:outline-none transition-colors placeholder:text-muted-foreground"
            />
          </div>

          {/* Count */}
          <div className="font-mono text-xs text-muted-foreground mb-4">
            Showing {filteredPolicies.length} of {allPolicies.length} policies
          </div>

          {/* Table */}
          <PolicyTable policies={filteredPolicies} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete home-search.tsx**

```bash
rm src/components/home-search.tsx
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

Expected: Clean build (or pre-existing errors only).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace homepage hero with policy browser"
```

---

### Task 7: Policies Route Redirect

**Files:**
- Modify: `src/app/policies/page.tsx`

- [ ] **Step 1: Replace the policies page with a redirect to home**

Replace `src/app/policies/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function PoliciesPage() {
  redirect('/');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/policies/page.tsx
git commit -m "feat: redirect /policies to homepage policy browser"
```

---

### Task 8: Policy Detail — Restyle

**Files:**
- Modify: `src/app/policies/[id]/page.tsx`
- Modify: `src/app/policies/[id]/policy-detail-tabs.tsx`

- [ ] **Step 1: Restyle the policy detail page wrapper**

Replace `src/app/policies/[id]/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import path from 'path';
import { type Policy } from '@/types';
import { readJsonFile } from '@/lib/file-store';
import { PolicyDetailTabs } from './policy-detail-tabs';

const POLICIES_FILE = path.join(process.cwd(), 'public', 'data', 'sample-policies.json');

async function getPolicy(id: string): Promise<Policy | null> {
  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  return policies.find(p => p.id === id) || null;
}

async function getRelatedPolicies(currentPolicy: Policy): Promise<Policy[]> {
  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  return policies
    .filter(p => p.id !== currentPolicy.id && p.status !== 'trashed')
    .filter(p =>
      p.jurisdiction === currentPolicy.jurisdiction ||
      p.tags.some(tag => currentPolicy.tags.includes(tag))
    )
    .slice(0, 3);
}

export async function generateStaticParams() {
  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  return policies.map(policy => ({ id: policy.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicy(id);
  if (!policy) return { title: 'Policy Not Found — Policai' };
  return {
    title: `${policy.title} — Policai`,
    description: policy.description,
    keywords: policy.tags,
  };
}

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicy(id);
  if (!policy) notFound();

  const relatedPolicies = await getRelatedPolicies(policy);

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="font-mono text-xs text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">Policies</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{policy.title}</span>
      </nav>

      <PolicyDetailTabs policy={policy} relatedPolicies={relatedPolicies} />
    </div>
  );
}
```

- [ ] **Step 2: Restyle policy-detail-tabs.tsx**

Read the full current file first, then rewrite it. The key changes are:
- Remove Badge imports and usage — use plain text with dot separators
- Remove Card wrapping — use plain sections
- Tabs use 2px underline style (the existing Tabs component can be styled with className overrides)
- Metadata row in Plex Mono
- AI Summary in a bordered box with mono label
- Tags as comma-separated Plex Mono text
- Related policies as a simple list with links

This file is large. Read it fully before rewriting. The structure to follow:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Policy,
  type Jurisdiction,
  type PolicyType,
  type PolicyStatus,
} from '@/types';

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-700',
  proposed: 'text-amber-600',
  amended: 'text-blue-700',
  repealed: 'text-gray-500',
};

interface PolicyDetailTabsProps {
  policy: Policy;
  relatedPolicies: Policy[];
}

export function PolicyDetailTabs({ policy, relatedPolicies }: PolicyDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'related'>('overview');

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'content' as const, label: 'Content' },
    { id: 'related' as const, label: 'Related' },
  ];

  return (
    <div>
      {/* Title */}
      <h1 className="text-2xl font-bold mb-3">{policy.title}</h1>

      {/* Metadata row */}
      <div className="font-mono text-sm text-muted-foreground mb-6 flex flex-wrap gap-x-2">
        <span>{JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction]}</span>
        <span>&middot;</span>
        <span>{POLICY_TYPE_NAMES[policy.type as PolicyType]}</span>
        <span>&middot;</span>
        <span className={STATUS_COLORS[policy.status] || ''}>
          {POLICY_STATUS_NAMES[policy.status as PolicyStatus]}
        </span>
        {policy.effectiveDate && (
          <>
            <span>&middot;</span>
            <span>
              {new Date(policy.effectiveDate).toLocaleDateString('en-AU', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed">{policy.description}</p>

          {policy.aiSummary && (
            <div className="border border-border p-4">
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                AI Summary
              </div>
              <p className="text-sm leading-relaxed">{policy.aiSummary}</p>
            </div>
          )}

          {policy.tags && policy.tags.length > 0 && (
            <div>
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Tags
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {policy.tags.join(', ')}
              </div>
            </div>
          )}

          {policy.agencies && policy.agencies.length > 0 && (
            <div>
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Agencies
              </div>
              <div className="text-sm">{policy.agencies.join(', ')}</div>
            </div>
          )}

          {policy.sourceUrl && (
            <a
              href={policy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          )}
        </div>
      )}

      {activeTab === 'content' && (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {policy.content || 'No detailed content available.'}
        </div>
      )}

      {activeTab === 'related' && (
        <div>
          {relatedPolicies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No related policies found.</p>
          ) : (
            <div className="border-t border-border">
              {relatedPolicies.map((rp) => (
                <Link
                  key={rp.id}
                  href={`/policies/${rp.id}`}
                  className="flex items-baseline justify-between py-3 border-b border-border hover:bg-muted/50 transition-colors -mx-1 px-1"
                >
                  <div>
                    <div className="text-sm font-medium text-primary">{rp.title}</div>
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">
                      {JURISDICTION_NAMES[rp.jurisdiction as Jurisdiction]}
                      {' \u00b7 '}
                      {POLICY_TYPE_NAMES[rp.type as PolicyType]}
                    </div>
                  </div>
                  <span className={`font-mono text-xs ${STATUS_COLORS[rp.status] || 'text-muted-foreground'}`}>
                    {POLICY_STATUS_NAMES[rp.status as PolicyStatus]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/app/policies/
git commit -m "feat: restyle policy detail with institutional typography"
```

---

### Task 9: Map Page — Sidebar Layout

**Files:**
- Modify: `src/app/map/page.tsx`

- [ ] **Step 1: Restyle the map page**

Read the full current `src/app/map/page.tsx` first. Then rewrite to:
- Remove the stat cards row at top
- Use sidebar + main layout pattern
- Sidebar: jurisdiction list (clickable text items, selected = bold + left accent border), and when selected, a compact policy list below
- Main: Australia map SVG, fills available space
- Empty state: centered text "Select a state or territory" in mono, no icon
- Keep the existing `AustraliaMap` component and its click handlers — just restyle the wrapper

Key structural changes:
- Remove `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` imports
- Remove the stats grid at top
- Remove Badge usage — use plain text
- Sidebar shows `JURISDICTIONS` label in mono
- Selected jurisdiction shows its policies in a list below

The map page is large (~400 lines). Focus the rewrite on the return JSX. Keep all the state logic, data loading, and handler functions. Only change the rendering.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/map/page.tsx
git commit -m "feat: restyle map page with sidebar layout"
```

---

### Task 10: Agencies Page — Table Layout

**Files:**
- Modify: `src/app/agencies/page.tsx`

- [ ] **Step 1: Restyle the agencies page**

Read the full current `src/app/agencies/page.tsx` first. Then rewrite to:
- Remove large stat cards
- Use sidebar + main layout
- Sidebar: search input (same minimal style as homepage), filter dropdown (All/Published/No Statement), summary line in mono: "50 agencies · 48 published · 2 pending"
- Main: data table with columns: Agency, Acronym, Jurisdiction, Statement
- Statement column: "Published" in green text, "Pending" in amber text
- Row click: toggles an accordion-style expansion showing the transparency statement text, AI usage info, and website link
- Remove Card, Badge, Tabs imports
- Remove the two-column card grid layout

Keep all the state logic and data. Only rewrite the JSX return.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/agencies/page.tsx
git commit -m "feat: restyle agencies page with table layout"
```

---

### Task 11: Clean Up and Final Verification

**Files:**
- Modify: `src/components/ui/back-to-top.tsx` (remove if it references theme)
- Possibly remove unused imports across all modified files

- [ ] **Step 1: Remove BackToTop if it uses theme**

Check `src/components/ui/back-to-top.tsx`. If it imports ThemeToggle or theme-provider, remove the component and its import from `layout.tsx`. If it's standalone, keep it.

- [ ] **Step 2: Remove next-themes dependency**

```bash
npm uninstall next-themes
```

- [ ] **Step 3: Full build verification**

Run: `npm run build 2>&1 | tail -30`

Expected: Clean build, all routes render.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: All 12 tests pass (utility tests unaffected by visual changes).

- [ ] **Step 5: Run lint**

Run: `npm run lint 2>&1 | tail -5`

Expected: Same or fewer issues than before (we removed several unused imports).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: clean up theme remnants and verify build"
```
