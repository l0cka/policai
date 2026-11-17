/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { GitHubError, readGitHubFile, type GitHubGet } from './github-file';

function base64(text: string): string {
  return Buffer.from(text).toString('base64');
}

function stubGet(responses: Record<string, unknown>): { get: GitHubGet; asked: string[] } {
  const asked: string[] = [];
  const get = (async (pathname: string) => {
    asked.push(pathname);
    if (!(pathname in responses)) throw new GitHubError(404, `GitHub GET ${pathname} failed (404)`);
    const response = responses[pathname];
    if (response instanceof Error) throw response;
    return response;
  }) as GitHubGet;
  return { get, asked };
}

describe('readGitHubFile', () => {
  it('returns the text and blob sha the contents API sends inline', async () => {
    const { get, asked } = stubGet({
      '/contents/data/small.json?ref=main': { type: 'file', sha: 'abc', encoding: 'base64', content: base64('[1]\n') },
    });

    expect(await readGitHubFile(get, 'data/small.json', 'main')).toEqual({ text: '[1]\n', sha: 'abc' });
    expect(asked).toEqual(['/contents/data/small.json?ref=main']);
  });

  it('reads a file over 1 MB through the blob API', async () => {
    const large = JSON.stringify({ padding: 'x'.repeat(1024 * 1024) });
    const { get } = stubGet({
      '/contents/data/large.json?ref=main': { type: 'file', sha: 'big', encoding: 'none', content: '' },
      '/git/blobs/big': { encoding: 'base64', content: base64(large) },
    });

    expect(await readGitHubFile(get, 'data/large.json', 'main')).toEqual({ text: large, sha: 'big' });
  });

  it('escapes each path segment and the ref', async () => {
    const { get, asked } = stubGet({});

    await readGitHubFile(get, 'data/a b.json', 'feature/x');

    expect(asked).toEqual(['/contents/data/a%20b.json?ref=feature%2Fx']);
  });

  it('returns null for a file that does not exist at the ref', async () => {
    expect(await readGitHubFile(stubGet({}).get, 'data/missing.json', 'main')).toBeNull();
  });

  it('refuses a directory', async () => {
    const { get } = stubGet({ '/contents/data?ref=main': [{ type: 'file', sha: 'abc' }] });

    await expect(readGitHubFile(get, 'data', 'main')).rejects.toThrow('data is not a file at main');
  });

  it('passes on any failure other than not found', async () => {
    const { get } = stubGet({ '/contents/data/small.json?ref=main': new GitHubError(500, 'upstream error') });

    await expect(readGitHubFile(get, 'data/small.json', 'main')).rejects.toThrow('upstream error');
  });
});
