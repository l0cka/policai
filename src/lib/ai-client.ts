/**
 * Shared AI client for content analysis.
 *
 * Provider selection, in order of preference:
 *  1. ANTHROPIC_API_KEY — official Anthropic SDK (model: AI_MODEL or claude-opus-4-8)
 *  2. OPENROUTER_API_KEY — OpenAI SDK against OpenRouter (model: AI_MODEL or openrouter/auto)
 *  3. Neither — no AI; callers degrade to heuristic scoring.
 */

export type AiProvider = 'anthropic' | 'openrouter' | null;

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/auto';

export function getAiProvider(): AiProvider {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  return null;
}

export function hasAiProvider(): boolean {
  return getAiProvider() !== null;
}

export function getAiModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return getAiProvider() === 'anthropic'
    ? DEFAULT_ANTHROPIC_MODEL
    : DEFAULT_OPENROUTER_MODEL;
}

/**
 * Run a single-turn prompt and return the response text.
 * Throws when no provider is configured — check hasAiProvider() first.
 */
export async function runAnalysisPrompt(
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<string> {
  const maxTokens = options.maxTokens ?? 1024;
  const provider = getAiProvider();

  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const response = await client.messages.create({
      model: getAiModel(),
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') return '';
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  if (provider === 'openrouter') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    const completion = await client.chat.completions.create({
      model: getAiModel(),
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content || '';
  }

  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.',
  );
}
