import { CopyTextButton } from '@/components/copy-text-button';

export function CiteThisRecord({ citation, permalink }: { citation: string; permalink: string }) {
  const lines = [
    { id: 'cite-source', label: 'Primary source', text: citation, copyLabel: 'Copy the suggested citation' },
    { id: 'cite-policai', label: 'This record', text: permalink, copyLabel: 'Copy the Policai record link' },
  ];
  return (
    <section aria-labelledby="cite-this-record" className="mt-8 max-w-[44rem] border-t border-[var(--rule-heavy)] pt-5">
      <h2 id="cite-this-record" className="section-title">
        Cite this record
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Suggested citation. Check it against the source.
      </p>
      <div className="mt-3 divide-y divide-[var(--rule-hair)] border-y border-[var(--rule-hair)]">
        {lines.map((line) => (
          <div key={line.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{line.label}</p>
              <p id={line.id} className="mt-1 break-words text-sm leading-6">
                {line.text}
              </p>
            </div>
            <CopyTextButton text={line.text} label={line.copyLabel} />
          </div>
        ))}
      </div>
    </section>
  );
}
