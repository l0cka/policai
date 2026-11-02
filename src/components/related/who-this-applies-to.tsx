import Link from 'next/link';
import { audienceLabel, LEGAL_FORCES, type RuleScope } from '@/lib/rule-finder/scope';

/**
 * Whom the instrument says it covers, from its reviewed rule-finder scope
 * entry. It quotes the instrument and never says whether a reader complies.
 */
export function WhoThisAppliesTo({ scope }: { scope: RuleScope | undefined }) {
  if (!scope || scope.review.status !== 'reviewed') return null;

  return (
    <section aria-labelledby="who-this-applies-to" className="mt-8 max-w-[44rem]">
      <h2 id="who-this-applies-to" className="section-title mb-3">
        Who this applies to
      </h2>
      {scope.kind === 'not_a_rule' ? (
        <p className="text-sm leading-6">{scope.note}</p>
      ) : (
        <ScopeFacts scope={scope} />
      )}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        This says whom the instrument covers. Whether it applies to you depends on your circumstances.{' '}
        <Link href="/rule-finder" className="text-primary underline underline-offset-4">
          Find the rules that name organisations like yours
        </Link>
      </p>
    </section>
  );
}

function ScopeFacts({ scope }: { scope: Extract<RuleScope, { kind: 'rule' }> }) {
  const force = LEGAL_FORCES.find(({ key }) => key === scope.legalForce)!;
  return (
    <>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Legal force</dt>
        <dd>
          <span className="font-medium">{force.label}.</span> {force.description}
        </dd>
        <dt className="text-muted-foreground">It names</dt>
        <dd>{scope.appliesTo.map(audienceLabel).join(' · ')}</dd>
      </dl>
      <blockquote className="mt-3 border-l-2 border-border pl-3 text-sm leading-6">
        “{scope.scope.quote}”
      </blockquote>
      <p className="mt-1.5 text-xs text-muted-foreground">
        <a href={scope.scope.url} className="text-primary underline underline-offset-4" rel="noopener noreferrer">
          {scope.scope.pinpoint}
        </a>
      </p>
    </>
  );
}
