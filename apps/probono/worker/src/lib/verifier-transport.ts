import { spawn } from 'node:child_process';
import { VERIFIER_JSON_SCHEMA } from './deadline-verify.js';

/*
 * Model transports for the deadline verifier. Both send one prompt with no
 * tools and return the model's JSON text; neither can act on anything in the
 * page text, so isolation is structural. Credentials come from the host
 * environment, never the repository.
 */

export type VerifierTransport = {
  model: string;
  complete(prompt: string): Promise<string>;
};

export class VerifierAuthError extends Error {}

const AUTH_ERROR_PATTERN = /unauthori[sz]ed|invalid api key|authentication|forbidden|401|403/i;

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string } | string;
};

/*
 * OpenAI-compatible chat completions (Ollama Cloud and the like), configured
 * by VERIFIER_BASE_URL / VERIFIER_API_KEY / VERIFIER_MODEL. Mirrors the root
 * Policai classifier transport; the packages are independent, so it is a copy.
 */
export function openAiCompatibleTransport(
  env: NodeJS.ProcessEnv = process.env,
  { timeoutMs = 180_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): VerifierTransport {
  const baseUrl = env.VERIFIER_BASE_URL;
  const apiKey = env.VERIFIER_API_KEY;
  const model = env.VERIFIER_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new VerifierAuthError('VERIFIER_BASE_URL, VERIFIER_API_KEY and VERIFIER_MODEL must be set');
  }
  const endpoint = new URL('chat/completions', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  return {
    model,
    async complete(prompt: string): Promise<string> {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'deadline_verdicts', strict: true, schema: VERIFIER_JSON_SCHEMA },
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let parsed: ChatCompletionResponse = {};
      try {
        parsed = JSON.parse(text) as ChatCompletionResponse;
      } catch {
        // Non-JSON body: handled by the status checks below.
      }
      const errorMessage = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
      if (response.status === 401 || response.status === 403 || (errorMessage && AUTH_ERROR_PATTERN.test(errorMessage))) {
        throw new VerifierAuthError(`verifier rejected the credential: HTTP ${response.status}`);
      }
      if (errorMessage) throw new Error(`verifier reported an error: ${errorMessage.slice(0, 200)}`);
      if (!response.ok) throw new Error(`verifier request failed: HTTP ${response.status} ${text.slice(0, 200)}`);
      const content = parsed.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) throw new Error('verifier returned an empty completion');
      return content;
    },
  };
}

/*
 * Claude Code CLI with every tool removed and structured output, mirroring the
 * safety flags in ops/enrich.sh. Returns the structured output as JSON text.
 */
export function claudeCliTransport(
  { bin = process.env.PROBONO_CLAUDE_BIN ?? '/home/l0cka/.local/bin/claude', model = 'sonnet', timeoutMs = 300_000 } = {},
): VerifierTransport {
  return {
    model: `claude-cli:${model}`,
    complete(prompt: string): Promise<string> {
      const args = [
        '-p', prompt,
        '--model', model,
        '--tools', '',
        '--permission-mode', 'dontAsk',
        '--safe-mode',
        '--disable-slash-commands',
        '--no-chrome',
        '--no-session-persistence',
        '--json-schema', JSON.stringify(VERIFIER_JSON_SCHEMA),
        '--max-turns', '3',
        '--output-format', 'json',
      ];
      return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
        child.stdout.on('data', (c) => (out += c));
        child.stderr.on('data', (c) => (err += c));
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          try {
            const body = JSON.parse(out) as { structured_output?: unknown; result?: string; is_error?: boolean };
            if (body.structured_output) return resolve(JSON.stringify(body.structured_output));
            if (body.result && !body.is_error) return resolve(body.result);
            reject(new Error(`claude returned no structured output (exit ${code}): ${String(body.result).slice(0, 200)}`));
          } catch {
            reject(new Error(`claude exit ${code}: ${err.slice(0, 200) || out.slice(0, 200)}`));
          }
        });
      });
    },
  };
}
