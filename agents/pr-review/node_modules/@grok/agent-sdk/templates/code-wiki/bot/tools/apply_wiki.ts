import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HostGitHubClient } from "@grok/agent-sdk";
import { parseGitHubPrContinuationKey } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { wikiPagePath } from "../lib/wiki.js";

const page = z.object({
  path: z.string().min(1).max(160),
  content: z.string().min(1).max(32_000),
});

type Page = z.infer<typeof page>;
type Octokit = Awaited<ReturnType<HostGitHubClient["getOctokit"]>>;

type Write = {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
  label: string;
  reason: string;
  pages: Page[];
  base: string;
  branch: string;
};

export default defineTool({
  description: "Skip or open a wiki follow-up PR for this merged pull request. Call once.",
  inputSchema: z.discriminatedUnion("verdict", [
    z.object({
      verdict: z.literal("skip"),
      reason: z.string().min(1).max(280),
    }),
    z.object({
      verdict: z.literal("update"),
      reason: z.string().min(1).max(280),
      pages: z.array(page).min(1).max(8),
    }),
  ]),
  async execute(input, ctx) {
    if (ctx.session.purpose === "eval") {
      return { posted: false, reason: "eval", verdict: input.verdict };
    }
    if (input.verdict === "skip") {
      return { posted: false, reason: input.reason, verdict: "skip" };
    }
    const ref = parseGitHubPrContinuationKey(ctx.session.continuationKey ?? "");
    if (ref === undefined) {
      throw new Error("apply_wiki requires a GitHub pull request session");
    }
    const base = (await readFile(join(ctx.workspaceDir, "pr/base.ref"), "utf8")).trim();
    const branch = wikiUpdateBranch(base);
    if (branch === undefined) {
      throw new Error("missing pr/base.ref");
    }
    const pages = input.pages.map((item) => {
      const path = wikiPagePath(item.path);
      if (path === undefined) {
        throw new Error(`invalid wiki path: ${item.path}`);
      }
      return { path, content: item.content };
    });
    return openWikiPr({
      octokit: await ctx.host.github.getOctokit(),
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      label: `${ref.owner}/${ref.repo}#${ref.number}`,
      reason: input.reason,
      pages,
      base,
      branch,
    });
  },
});

function wikiUpdateBranch(base: string): string | undefined {
  if (base === "" || !/^[A-Za-z0-9._/-]+$/.test(base)) {
    return undefined;
  }
  return `wiki/${base.replaceAll("/", "-")}`;
}

async function openWikiPr(input: Write) {
  const repo = { owner: input.owner, repo: input.repo };
  const existing = await input.octokit.rest.pulls.list({
    ...repo,
    state: "open",
    head: `${input.owner}:${input.branch}`,
    base: input.base,
    per_page: 1,
  });
  const open = existing.data[0];
  if (open !== undefined && citesSource(open.body, input.number)) {
    return {
      posted: false,
      reason: "exists",
      verdict: "update",
      pr: input.label,
      url: open.html_url,
    };
  }
  const branchSha = await refSha(input.octokit, repo, input.branch);
  const parent = branchSha ?? (await refSha(input.octokit, repo, input.base));
  if (parent === undefined) {
    throw new Error(`missing base ref: ${input.base}`);
  }
  const { data: commit } = await input.octokit.rest.git.getCommit({
    ...repo,
    commit_sha: parent,
  });
  const blobs = await Promise.all(
    input.pages.map(async (item) => {
      const { data } = await input.octokit.rest.git.createBlob({
        ...repo,
        content: Buffer.from(item.content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: item.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: data.sha,
      };
    }),
  );
  const { data: tree } = await input.octokit.rest.git.createTree({
    ...repo,
    base_tree: commit.tree.sha,
    tree: blobs,
  });
  const { data: next } = await input.octokit.rest.git.createCommit({
    ...repo,
    message: `wiki: ${input.reason}`,
    tree: tree.sha,
    parents: [parent],
  });
  if (branchSha === undefined) {
    await input.octokit.rest.git.createRef({
      ...repo,
      ref: `refs/heads/${input.branch}`,
      sha: next.sha,
    });
  } else {
    await input.octokit.rest.git.updateRef({
      ...repo,
      ref: `heads/${input.branch}`,
      sha: next.sha,
    });
  }
  if (open !== undefined) {
    await input.octokit.rest.pulls.update({
      ...repo,
      pull_number: open.number,
      body: appendSource(open.body ?? "", input.reason, input.number),
    });
    return {
      posted: true,
      verdict: "update",
      pr: input.label,
      url: open.html_url,
    };
  }
  const { data: pull } = await input.octokit.rest.pulls.create({
    ...repo,
    title: `wiki: update from #${input.number}`,
    head: input.branch,
    base: input.base,
    body: `${input.reason}\n\nSource: #${input.number}`,
  });
  return {
    posted: true,
    verdict: "update",
    pr: input.label,
    url: pull.html_url,
  };
}

async function refSha(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  name: string,
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.git.getRef({
      ...repo,
      ref: `heads/${name}`,
    });
    return data.object.sha;
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

function citesSource(body: string | null | undefined, number: number): boolean {
  return new RegExp(`(?:^|\\n)Source:.*#${number}(?:\\s|$)`).test(body ?? "");
}

function appendSource(body: string, reason: string, number: number): string {
  return `${body.trim()}\n\n${reason}\nSource: #${number}`;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
