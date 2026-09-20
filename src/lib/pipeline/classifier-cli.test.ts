import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeAuthError } from './claude-auth';
import { runClassifier } from './classifier-cli';

// The fetch call is injected via this seam so no test can reach the network:
// a broken seam fails the test instantly instead of silently falling through
// to the real endpoint.
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.CLASSIFIER_BASE_URL = 'https://classifier.example/v1/';
  process.env.CLASSIFIER_API_KEY = 'test-key';
  process.env.CLASSIFIER_MODEL = 'test-model';
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runClassifier', () => {
  it('returns the assistant content from a successful completion', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: '[{"id":"a"}]' } }] }),
    );
    await expect(runClassifier('prompt')).resolves.toBe('[{"id":"a"}]');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://classifier.example/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('test-model');
    expect(body.messages[0].content).toBe('prompt');
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('raises ClaudeAuthError when no credential is configured', async () => {
    delete process.env.CLASSIFIER_API_KEY;
    await expect(runClassifier('test')).rejects.toThrow(ClaudeAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('raises ClaudeAuthError on a 401 from the endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'invalid api key' } }, 401));
    await expect(runClassifier('test')).rejects.toThrow(ClaudeAuthError);
  });

  it('raises a generic error for non-auth endpoint failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'model overloaded' } }, 503));
    await expect(runClassifier('test')).rejects.toThrow(/model overloaded/);
    await expect(runClassifier('test')).rejects.not.toThrow(ClaudeAuthError);
  });

  it('raises a generic error on an empty completion', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await expect(runClassifier('test')).rejects.toThrow(/empty completion/);
  });
});