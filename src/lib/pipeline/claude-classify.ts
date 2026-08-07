import { z } from 'zod';
import { runClaude } from './claude-cli';

export const CLAUDE_BATCH_SIZE = 20;
const EXCERPT_LIMIT = 600;

export interface ClaudeCandidate {
  id: string;
  title: string;
  sourceName: string;
  excerpt: string;
}

const verdictSchema = z.object({
  id: z.string().min(1),
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  jurisdiction: z.string().nullable(),
  type: z.string().nullable(),
  // Prompt asks Claude for summaries of 200 chars or fewer; schema accepts up to
  // 400 as deliberate tolerance so a slightly long summary is accepted rather
  // than silently dropped (validation failure = skipped entry, not corruption).
  summary: z.string().max(400),
});

export type ClaudeVerdict = z.infer<typeof verdictSchema>;

function buildPrompt(batch: ClaudeCandidate[]): string {
  const items = batch.map((c) => ({
    id: c.id,
    title: c.title,
    source: c.sourceName,
    excerpt: c.excerpt.slice(0, EXCERPT_LIMIT),
  }));
  return [
    'You assess whether items are Australian AI policy, regulation, governance or court guidance.',
    'For each item return an object with: id, relevant (boolean), confidence (0-1),',
    'jurisdiction (federal|nsw|vic|qld|wa|sa|tas|act|nt or null), type (or null),',
    'and summary (a factual sentence, 200 characters or fewer, no marketing language).',
    'Return ONLY a JSON array. No prose, no code fences.',
    '',
    `Items:\n${JSON.stringify(items)}`,
  ].join('\n');
}

/** Pulls the first JSON array out of a reply that may carry prose around it. */
function extractArray(reply: string): unknown[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function classifyBatch(
  candidates: ClaudeCandidate[],
): Promise<ClaudeVerdict[]> {
  if (candidates.length === 0) return [];

  const verdicts: ClaudeVerdict[] = [];
  for (let i = 0; i < candidates.length; i += CLAUDE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + CLAUDE_BATCH_SIZE);
    const reply = await runClaude(buildPrompt(batch));
    for (const entry of extractArray(reply)) {
      const parsed = verdictSchema.safeParse(entry);
      // A malformed entry is a skipped item, never a corrupt record.
      if (parsed.success) verdicts.push(parsed.data);
    }
  }
  return verdicts;
}
