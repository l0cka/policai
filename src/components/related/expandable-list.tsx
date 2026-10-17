'use client';

import { RELATED_VISIBLE_LIMIT } from '@/lib/related-policies';
import { useId, useState, type ReactNode } from 'react';

export function ExpandableList({
  visible,
  rest,
  total,
  label,
}: {
  visible: ReactNode;
  rest: ReactNode;
  total: number;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  return (
    <>
      <ul id={listId} aria-label={label} className="divide-y divide-[var(--rule-hair)] border-y border-[var(--rule-hair)]">
        {visible}
        {expanded ? rest : null}
      </ul>
      {total > RELATED_VISIBLE_LIMIT ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-primary hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${total} related`}
        </button>
      ) : null}
    </>
  );
}
