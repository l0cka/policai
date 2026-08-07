import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class ClaudeAuthError extends Error {}

/**
 * Invokes Claude Code headlessly and returns its text result.
 *
 * Auth comes from the Claude Code credentials already on the host. An expired
 * credential is raised as ClaudeAuthError because the remedy is a human
 * logging in, which is a different operational response to a source failing.
 */
export async function runClaude(prompt: string, timeoutMs = 180_000): Promise<string> {
  const binary = process.env.CLAUDE_BIN || 'claude';
  try {
    const { stdout } = await execFileAsync(
      binary,
      ['-p', prompt, '--output-format', 'json'],
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { is_error?: boolean; result?: string };
    if (parsed.is_error) throw new Error(`claude reported an error: ${parsed.result ?? ''}`);
    return parsed.result ?? '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not logged in|authentication|credential|401/i.test(message)) {
      throw new ClaudeAuthError(message);
    }
    throw error;
  }
}
