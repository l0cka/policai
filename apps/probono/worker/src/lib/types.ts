import { z } from 'zod';
import { vetDeadlines, type DroppedDeadline } from './deadline-rules.js';

export const STREAMS = ['news', 'law_reform', 'funding', 'tech_justice'] as const;
export type Stream = (typeof STREAMS)[number];

export const EnrichmentSchema = z.object({
  stream: z.enum(STREAMS),
  relevant: z.boolean(),
  blurb: z.string().min(20).max(600),
  opportunity: z.boolean(),
  opportunity_reason: z.string().max(300).nullable(),
  entities: z.object({
    organisations: z.array(z.string()).default([]),
    /*
     * Each date is checked on its own by `prepareEnrichment` against
     * `DeadlineSchema` and the save-time rules in deadline-rules.ts. A bad date
     * is dropped with a logged reason; it must not stall the whole item.
     */
    deadlines: z.array(z.unknown()).default([]),
    amounts: z.array(z.string()).default([]),
  }),
  excerpt: z.string().max(700).nullable(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export type PreparedEnrichment =
  | { ok: true; enrichment: Enrichment; dropped: DroppedDeadline[]; notes: string[] }
  | { ok: false; error: string };

/* Validate the item, then vet each deadline against the save-time rules. */
export function prepareEnrichment(data: unknown, now: Date = new Date()): PreparedEnrichment {
  const parsed = EnrichmentSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { kept, dropped, notes } = vetDeadlines(parsed.data.entities.deadlines, now);
  return {
    ok: true,
    enrichment: { ...parsed.data, entities: { ...parsed.data.entities, deadlines: kept } },
    dropped,
    notes,
  };
}
