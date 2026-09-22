import type { PublicCourtRequirement } from "@/types";

const MODALITY_LABELS: Record<PublicCourtRequirement["modality"], string> = {
  must: "Must",
  must_not: "Must not",
  should: "Should",
  should_not: "Should not",
  may: "May",
  will: "Will",
};

export function CourtRequirementsList({ title, requirements }: {
  title: string;
  requirements: PublicCourtRequirement[];
}) {
  if (!requirements.length) return null;
  return (
    <section aria-label={`Verified requirements from ${title}`}>
      <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">
        Verified requirements ({requirements.length})
      </h3>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {requirements.map((requirement) => (
          <article key={requirement.id} className="py-3">
            <p className="text-sm text-foreground">
              <span className="mr-2 inline-flex rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide text-primary">
                {MODALITY_LABELS[requirement.modality]}
              </span>
              {requirement.action}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Applies to: {requirement.actor}</p>
            {requirement.conditions.map((condition) => (
              <p key={condition} className="mt-1 text-xs text-muted-foreground">Condition: {condition}</p>
            ))}
            {requirement.exceptions.map((exception) => (
              <p key={exception} className="mt-2 text-sm font-medium leading-6 text-foreground">Exception: {exception}</p>
            ))}
            <blockquote className="mt-2 border-l-2 border-[var(--rule-heavy)] pl-3 text-xs leading-5 text-muted-foreground">
              “{requirement.source.quote}”
              <cite className="mt-1 block not-italic text-foreground">{requirement.source.locator}</cite>
            </blockquote>
          </article>
        ))}
      </div>
    </section>
  );
}
