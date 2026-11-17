export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type GitHubGet = <T>(pathname: string) => Promise<T>;

export interface GitHubFile {
  text: string;
  sha: string;
}

interface GhContents {
  type: string;
  sha: string;
  encoding?: string;
  content?: string;
}

interface GhBlob {
  content: string;
}

export async function readGitHubFile(
  get: GitHubGet,
  repoRelativePath: string,
  ref: string,
): Promise<GitHubFile | null> {
  const encodedPath = repoRelativePath.split('/').map(encodeURIComponent).join('/');
  let file: GhContents | GhContents[];
  try {
    file = await get<GhContents | GhContents[]>(
      `/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
  if (Array.isArray(file) || file.type !== 'file') {
    throw new Error(`${repoRelativePath} is not a file at ${ref}`);
  }
  const encoded =
    file.encoding === 'base64' && file.content
      ? file.content
      : (await get<GhBlob>(`/git/blobs/${file.sha}`)).content;
  return { text: Buffer.from(encoded, 'base64').toString('utf8'), sha: file.sha };
}
