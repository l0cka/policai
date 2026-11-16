'use client';

import { type LucideIcon, SearchX, FileQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Preconfigured variants for common scenarios */
export function NoResultsState({ query, className }: { query?: string; className?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No results found"
      description={
        query
          ? `No items match "${query}". Try adjusting your search or filters.`
          : 'Try adjusting your filters to see results.'
      }
      className={className}
    />
  );
}
