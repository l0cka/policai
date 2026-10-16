import type { ComponentPropsWithoutRef } from 'react';

export function ArticleTable(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="article-table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  );
}
