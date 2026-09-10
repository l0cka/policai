import { z } from 'zod';

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
     * `kind` separates dates a reader must act on from dates that merely
     * arrive. Optional rather than required: a missed field falls back to a
     * label heuristic in the dashboard query, where an omission costs us a
     * misfiled date — making it required would cost us a stalled item.
     */
    deadlines: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          label: z.string(),
          kind: z.enum(['action', 'milestone']).optional(),
        }),
      )
      .default([]),
    amounts: z.array(z.string()).default([]),
  }),
  excerpt: z.string().max(700).nullable(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;
