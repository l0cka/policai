import { prompt, type HostGitHubClient, type SendMessageFn } from "@grok/agent-sdk";
import { type GitHubPrRef, parseGitHubPrRef } from "@grok/agent-sdk/channels/github";

export type Collected = GitHubPrRef & {
  title: string;
  body: string;
  files: string[];
};

export function tokenFor(pr: GitHubPrRef): string {
  return `pr:${pr.label}`;
}

export function parseToken(token: string | null | undefined): GitHubPrRef | undefined {
  if (token == null || !token.startsWith("pr:")) {
    return undefined;
  }
  return parseGitHubPrRef(token.slice(3));
}

export function filesFor(pr: Collected): Record<string, string> {
  return {
    "pr.md": `# ${pr.title}\n\n${pr.url}\n\n${pr.body}\n`,
    "files.md": `${pr.files.join("\n")}\n`,
  };
}

export function promptFor(pr: Collected): string {
  return prompt`
    Record a walkthrough for ${pr.url}.
    Read pr.md and files.md first. Do not fetch the pull request yourself.
  `;
}

export function sendOptions(pr: Collected) {
  return {
    continuationToken: tokenFor(pr),
    title: pr.title,
    admission: "coalesce" as const,
    workspaceFiles: filesFor(pr),
  };
}

export async function collectPr(github: HostGitHubClient, ref: GitHubPrRef): Promise<Collected> {
  const octokit = await github.getOctokit();
  const args = {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
  };
  const [pull, listed] = await Promise.all([
    octokit.rest.pulls.get(args),
    octokit.rest.pulls.listFiles({ ...args, per_page: 50 }),
  ]);
  return {
    ...ref,
    title: pull.data.title,
    body: pull.data.body ?? "",
    files: listed.data.map((file) => file.filename),
  };
}

export async function startDemo(send: SendMessageFn, github: HostGitHubClient, ref: GitHubPrRef) {
  const pr = await collectPr(github, ref);
  return send(promptFor(pr), sendOptions(pr));
}
