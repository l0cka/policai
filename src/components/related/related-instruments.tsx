import Link from 'next/link';
import { getJurisdictionName, getPolicyTypeName } from '@/types';
import { RELATED_VISIBLE_LIMIT, type RelatedInstrument } from '@/lib/related-policies';
import { ExpandableList } from './expandable-list';

function RelatedItem({ item }: { item: RelatedInstrument }) {
  return (
    <li className="py-4">
      {item.relation ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--status-repealed)]">
          {item.relation}
        </p>
      ) : null}
      <Link href={`/policies/${item.id}`} className="font-display text-base leading-snug hover:text-primary">
        {item.title}
      </Link>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {getJurisdictionName(item.jurisdiction)} · {getPolicyTypeName(item.type)}
      </p>
      {item.sharedThemes.length > 0 ? (
        <p className="mt-1 font-sans text-[0.8125rem] leading-5 text-muted-foreground">
          Shares: {item.sharedThemes.join(', ')}
        </p>
      ) : null}
    </li>
  );
}

export function RelatedInstruments({ items }: { items: RelatedInstrument[] }) {
  if (items.length === 0) return null;

  const visible = items.slice(0, RELATED_VISIBLE_LIMIT);
  const rest = items.slice(RELATED_VISIBLE_LIMIT);
  const list = (entries: RelatedInstrument[]) =>
    entries.map((item) => <RelatedItem key={item.id} item={item} />);

  return (
    <section aria-labelledby="related-instruments" className="mt-8 max-w-[44rem]">
      <h2 id="related-instruments" className="mb-3 font-display text-[1.125rem] leading-snug">
        Related instruments
      </h2>
      <ExpandableList
        label="Related instruments"
        total={items.length}
        visible={list(visible)}
        rest={list(rest)}
      />
    </section>
  );
}
