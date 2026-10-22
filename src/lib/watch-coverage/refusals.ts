import type { Jurisdiction } from '@/types';
import { JURISDICTIONS } from '@/types';
import type { FailureClass } from '@/lib/pipeline/failure';
import { hostOf } from '@/lib/pipeline/host';
import type { SourceHealthRecord } from '@/lib/pipeline/source-health';
import type { ManualBecause, WatchSource } from '@/lib/pipeline/sources';
import type { Body, Tier } from './bodies';

/** How a site keeps the declared Policai collector out. */
export type RefusalKind = Extract<ManualBecause, 'identity_refused' | 'bot_blocked' | 'robots_disallowed'>;

/** What Policai does about it: a decision on record, or none yet. */
export type RefusalResponse = 'manual' | 'await_allowlist' | 'undecided';

export interface SiteRefusal {
  sourceId: string;
  sourceName: string;
  url: string;
  host: string;
  /** True when the refusing host is a linked document's, not the source page's. */
  linked: boolean;
  bodyName: string;
  jurisdiction: Jurisdiction;
  tier: Tier | null;
  kind: RefusalKind;
  /** YYYY-MM-DD of the decision, or the first refused run. */
  since: string;
  response: RefusalResponse;
  /** The decision's evidence; absent while undecided. */
  evidence: string | null;
}

const REFUSAL_KINDS: ReadonlySet<string> = new Set<RefusalKind>([
  'identity_refused',
  'bot_blocked',
  'robots_disallowed',
]);
const OBSERVED: ReadonlySet<FailureClass> = new Set<FailureClass>(['identity_refused', 'robots_disallowed']);

/** The Sydney calendar day of a stamp, as YYYY-MM-DD, matching /status. */
const sydneyDay = (stamp: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(stamp));

/**
 * Every enabled source whose site refuses the declared collector: the
 * decided ones from their manual decision, and automatic ones the ledger
 * shows failing with a refusal that nobody has decided yet. A source taken
 * off for any other reason (a page that no longer exists) is not listed.
 */
export function siteRefusals(input: {
  bodies: readonly Body[];
  sources: readonly WatchSource[];
  sourceHealth: Readonly<Record<string, SourceHealthRecord>>;
}): SiteRefusal[] {
  const bodyById = new Map(input.bodies.map((body) => [body.id as string, body]));
  const rows = input.sources.flatMap((source): SiteRefusal[] => {
    if (!source.enabled || !URL.canParse(source.url)) return [];
    const body = bodyById.get(source.bodyId);
    const base = {
      sourceId: source.id,
      sourceName: source.name,
      url: source.url,
      host: hostOf(new URL(source.url)) as string,
      linked: false,
      bodyName: body?.name ?? source.bodyId,
      jurisdiction: source.jurisdiction,
      tier: body?.tier ?? null,
    };
    if (source.automation !== 'automatic') {
      const decision = source.automation;
      if (!REFUSAL_KINDS.has(decision.because)) return [];
      return [
        {
          ...base,
          host: decision.blockedHost ?? base.host,
          linked: decision.blockedHost !== undefined && decision.blockedHost !== base.host,
          kind: decision.because as RefusalKind,
          since: decision.since,
          response: decision.decision,
          evidence: decision.evidence,
        },
      ];
    }
    const health = input.sourceHealth[source.id];
    if (!health?.firstFailureAt || health.consecutiveFailures === 0) return [];
    if (!health.lastFailureClass || !OBSERVED.has(health.lastFailureClass)) return [];
    return [
      {
        ...base,
        kind: health.lastFailureClass as RefusalKind,
        since: sydneyDay(health.firstFailureAt),
        response: 'undecided',
        evidence: null,
      },
    ];
  });
  const tierRank = (tier: Tier | null) => (tier ? 'ABC'.indexOf(tier) : 3);
  return rows.sort(
    (a, b) =>
      JURISDICTIONS.indexOf(a.jurisdiction) - JURISDICTIONS.indexOf(b.jurisdiction) ||
      tierRank(a.tier) - tierRank(b.tier) ||
      a.bodyName.localeCompare(b.bodyName) ||
      a.sourceId.localeCompare(b.sourceId),
  );
}
