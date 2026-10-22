import type { Jurisdiction } from '@/types';
import { JURISDICTIONS } from '@/types';
import type { Host } from '@/lib/pipeline/host';

export type BodyId = string & { readonly __brand: 'BodyId' };
export type Tier = 'A' | 'B' | 'C';

export type BodyScope =
  | { status: 'in_scope'; decidedAt: string; decidedBy: string }
  | { status: 'out_of_scope'; decidedAt: string; decidedBy: string; reason: string }
  | { status: 'unassessed' };

/**
 * A body that publishes: the unit watch coverage counts. `bodies.json` owns
 * body identity; sources and directory records point at it by `bodyId`.
 */
export interface Body {
  id: BodyId;
  name: string;
  jurisdiction: Jurisdiction;
  tier: Tier;
  hosts: Host[];
  scope: BodyScope;
}

const TIERS: readonly string[] = ['A', 'B', 'C'];
const BODY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseScope(raw: unknown, label: string): BodyScope {
  if (!isRecord(raw)) throw new Error(`${label}: scope must be an object`);
  if (raw.status === 'unassessed') return { status: 'unassessed' };
  if (raw.status !== 'in_scope' && raw.status !== 'out_of_scope')
    throw new Error(`${label}: invalid scope status`);
  if (typeof raw.decidedAt !== 'string' || !CALENDAR_DATE.test(raw.decidedAt))
    throw new Error(`${label}: scope decidedAt must be YYYY-MM-DD`);
  if (!nonEmpty(raw.decidedBy)) throw new Error(`${label}: scope needs decidedBy`);
  if (raw.status === 'in_scope')
    return { status: 'in_scope', decidedAt: raw.decidedAt, decidedBy: raw.decidedBy };
  if (!nonEmpty(raw.reason)) throw new Error(`${label}: out_of_scope needs a reason`);
  return {
    status: 'out_of_scope',
    decidedAt: raw.decidedAt,
    decidedBy: raw.decidedBy,
    reason: raw.reason,
  };
}

/** Parses `data/bodies.json`, throwing on the first malformed entry. */
export function parseBodies(raw: unknown): Body[] {
  if (!Array.isArray(raw)) throw new Error('bodies: expected an array');
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    const label = `bodies[${index}]`;
    if (!isRecord(entry)) throw new Error(`${label}: expected an object`);
    const { id, name, jurisdiction, tier, hosts, scope } = entry;
    if (typeof id !== 'string' || !BODY_ID.test(id)) throw new Error(`${label}: invalid id`);
    if (seen.has(id)) throw new Error(`bodies:${id}: duplicate id`);
    seen.add(id);
    if (!nonEmpty(name)) throw new Error(`bodies:${id}: missing name`);
    if (!(JURISDICTIONS as readonly unknown[]).includes(jurisdiction))
      throw new Error(`bodies:${id}: invalid jurisdiction`);
    if (!TIERS.includes(tier as string)) throw new Error(`bodies:${id}: invalid tier`);
    if (
      !Array.isArray(hosts) ||
      hosts.length === 0 ||
      !hosts.every((host) => typeof host === 'string' && HOST.test(host))
    )
      throw new Error(`bodies:${id}: hosts must be lower-case host names`);
    return {
      id: id as BodyId,
      name,
      jurisdiction: jurisdiction as Jurisdiction,
      tier: tier as Tier,
      hosts: hosts as Host[],
      scope: parseScope(scope, `bodies:${id}`),
    };
  });
}
