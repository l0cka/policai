import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeAuthError, runClaude, setExecForTesting } from './claude-cli';

// Test-only DI seam instead of vi.mock('node:child_process', …): that builtin
// mock was verified on Argus NOT to intercept calls in this project's Vitest
// setup — the real execFile ran regardless (`Command failed: /bin/false -p
// test --output-format json`), which before the CLAUDE_BIN guard existed
// meant this test file spawned the real `claude` binary nine times in
// parallel, making paid API calls and crashing the host. claude-cli.ts now
// takes its exec call via `setExecForTesting`, so a fake is injected directly
// — there is no builtin to miss, and a broken seam fails the test instantly
// instead of silently falling through to the real binary.
const execMock = vi.fn();

beforeEach(() => {
  execMock.mockReset();
  setExecForTesting(execMock);
});

function mockFailure(message: string) {
  execMock.mockRejectedValueOnce(new Error(message));
}

function mockStdout(stdout: string) {
  execMock.mockResolvedValueOnce({ stdout, stderr: '' });
}

describe('runClaude auth error detection', () => {
  it.each([
    'Please authenticate with your credentials',
    'Invalid API key provided',
    '401 Unauthorized',
    'You are not logged in',
  ])('raises ClaudeAuthError for %j', async (message) => {
    mockFailure(message);
    await expect(runClaude('test')).rejects.toThrow(ClaudeAuthError);
  });

  it('raises a generic error for non-auth failures like "spawn ETIMEDOUT"', async () => {
    mockFailure('spawn ETIMEDOUT');
    const error = await runClaude('test').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ClaudeAuthError);
  });

  it('raises ClaudeAuthError when the CLI reports an auth failure in its JSON result', async () => {
    mockStdout(JSON.stringify({ is_error: true, result: 'Invalid API key' }));
    await expect(runClaude('test')).rejects.toThrow(ClaudeAuthError);
  });
});

describe('runClaude success path', () => {
  it('returns the result field from the CLI JSON output', async () => {
    mockStdout(JSON.stringify({ is_error: false, result: 'classified' }));
    await expect(runClaude('test')).resolves.toBe('classified');
  });

  it('returns an empty string when the CLI omits a result', async () => {
    mockStdout(JSON.stringify({ is_error: false }));
    await expect(runClaude('test')).resolves.toBe('');
  });

  it('invokes the CLI binary with headless JSON output flags', async () => {
    mockStdout(JSON.stringify({ result: 'ok' }));
    await runClaude('classify this');
    // Binary name comes from process.env.CLAUDE_BIN, which vitest.setup.ts
    // pins to /bin/false for every test run — assert against that env var
    // rather than a hardcoded 'claude' so the test doesn't fight the guard.
    expect(execMock).toHaveBeenCalledWith(
      process.env.CLAUDE_BIN,
      ['-p', 'classify this', '--output-format', 'json'],
      expect.objectContaining({ timeout: 180_000 }),
    );
  });
});
