import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export class ClaudeAuthError extends Error {}

/**
 * Regex pattern to detect authentication errors from the Claude CLI.
 * Matches realistic phrasings like "Please authenticate", "Invalid API key",
 * "401 Unauthorized", etc. This is a heuristic over CLI text because the CLI
 * gives no structured auth signal, so it errs toward catching auth failures
 * (false positives matter less than false negatives).
 */
const AUTH_ERROR_PATTERN = /authenticate|authentication|unauthenticated|unauthorized|not logged in|log in|login|credential|expired|invalid api key|401|403/i;

/** The subset of promisified execFile's shape that runClaude depends on. */
type ExecLike = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Module-level indirection point for the exec call, defaulting to the real
 * promisified execFile.
 *
 * WHY this exists instead of `vi.mock('node:child_process', …)` in tests:
 * that builtin mock was verified NOT to intercept calls in this project's
 * Vitest setup — Argus test runs showed the REAL execFile still running
 * (`Command failed: /bin/false -p test --output-format json`), meaning
 * before the CLAUDE_BIN guard existed, unit tests spawned the real `claude`
 * binary nine times in parallel, making paid API calls and crashing the
 * host. Dependency injection removes the failure class entirely: there is no
 * builtin to intercept, so a test either injects a fake exec or it doesn't
 * run at all — there's no silent fallthrough to the real binary.
 */
let exec: ExecLike = promisify(execFile);

/** Test-only seam for replacing the exec implementation. See `exec` above for why. */
export function setExecForTesting(fn: ExecLike): void {
  exec = fn;
}

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
    const { stdout } = await exec(
      binary,
      ['-p', prompt, '--output-format', 'json'],
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { is_error?: boolean; result?: string };
    if (parsed.is_error) throw new Error(`claude reported an error: ${parsed.result ?? ''}`);
    return parsed.result ?? '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (AUTH_ERROR_PATTERN.test(message)) {
      throw new ClaudeAuthError(message);
    }
    throw error;
  }
}
