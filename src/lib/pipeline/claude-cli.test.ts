import { promisify } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted, because the vi.mock factory below is hoisted above this file's
// own initialisation and would otherwise read execFileMock in its TDZ.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

// Mock execFile callback-style so the real promisify() in claude-cli wraps it.
// The promisify.custom hook is required: real execFile carries one that yields
// { stdout, stderr }, and promisify's generic path would yield stdout alone.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const execFile = (...args: unknown[]) => execFileMock(...args);
  Object.defineProperty(execFile, promisify.custom, {
    value: (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        execFileMock(...args, (error: Error | null, stdout = '', stderr = '') => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        });
      }),
  });
  return { ...actual, default: actual, execFile };
});

import { ClaudeAuthError, runClaude } from './claude-cli';

function callback(args: unknown[]) {
  return args[args.length - 1] as (error: Error | null, stdout?: string, stderr?: string) => void;
}

function mockFailure(message: string) {
  execFileMock.mockImplementationOnce((...args: unknown[]) => {
    callback(args)(new Error(message));
  });
}

function mockStdout(stdout: string) {
  execFileMock.mockImplementationOnce((...args: unknown[]) => {
    callback(args)(null, stdout, '');
  });
}

beforeEach(() => {
  execFileMock.mockReset();
});

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
    expect(execFileMock).toHaveBeenCalledWith(
      'claude',
      ['-p', 'classify this', '--output-format', 'json'],
      expect.objectContaining({ timeout: 180_000 }),
      expect.any(Function),
    );
  });
});
