import type { HostGitHubClient } from "@grok/agent-sdk";
import { defaultGitHubAuth, githubChannel } from "@grok/agent-sdk/channels/github";
import { REPOS, watches } from "../lib/repos.js";
import { WIKI_DIR, isWikiPath } from "../lib/wiki.js";

const MAX_DIFF_CHARS = 150_000;
const MAX_WIKI_PAGES = 40;
const LIST_FILES_CAP = 3000;

type Octokit = Awaited<ReturnType<HostGitHubClient["getOctokit"]>>;

export default githubChannel({
  cursorAccount: { repos: REPOS, permissions: "contents-write" },
  deliverReplies: false,
  onComment: () => null,
  onPullRequest: async (ctx, pr) => {
    if (!watches(ctx.repository.fullName)) {
      return null;
    }
    if (pr.action !== "closed" || !pr.merged) {
      return null;
    }
    if (pr.headRef.startsWith(`${WIKI_DIR}/`)) {
      return null;
    }
    const octokit = await ctx.github.getOctokit();
    const pull = {
      owner: ctx.repository.owner,
      repo: ctx.repository.name,
      pull_number: pr.number,
    };
    const listed = await octokit.paginate(octokit.rest.pulls.listFiles, {
      ...pull,
      per_page: 100,
    });
    const files = listed.map((file) => file.filename);
    if (files.length > 0 && files.length < LIST_FILES_CAP && files.every(isWikiPath)) {
      return null;
    }
    return {
      auth: defaultGitHubAuth(ctx),
      context: ["This pull request merged. Read pr/files.txt, pr/diff.patch, and wiki/."],
      async workspaceFiles() {
        const [diff, wiki] = await Promise.all([
          octokit.rest.pulls.get({ ...pull, mediaType: { format: "diff" } }),
          loadWiki(octokit, pull.owner, pull.repo, pr.baseRef),
        ]);
        const text = typeof diff.data === "string" ? diff.data : "";
        return {
          "pr/base.ref": `${pr.baseRef}\n`,
          "pr/files.txt": `${files.join("\n")}\n`,
          "pr/diff.patch":
            text.length > MAX_DIFF_CHARS
              ? `${text.slice(0, MAX_DIFF_CHARS)}\n…[truncated]\n`
              : text,
          ...wiki,
        };
      },
    };
  },
});

async function loadWiki(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<Record<string, string>> {
  const listed = await readContents(octokit, {
    owner,
    repo,
    path: WIKI_DIR,
    ref,
  });
  if (!Array.isArray(listed)) {
    return { "wiki/pages.txt": "" };
  }
  const markdown = listed.filter((item) => item.type === "file" && item.name.endsWith(".md"));
  const truncated = markdown.length > MAX_WIKI_PAGES;
  const files = markdown.slice(0, MAX_WIKI_PAGES);
  const pages: Record<string, string> = {};
  await Promise.all(
    files.map(async (file) => {
      const body = await readContents(octokit, {
        owner,
        repo,
        path: `${WIKI_DIR}/${file.name}`,
        ref,
      });
      if (
        body === undefined ||
        Array.isArray(body) ||
        body.type !== "file" ||
        body.encoding !== "base64"
      ) {
        return;
      }
      pages[`${WIKI_DIR}/${file.name}`] = Buffer.from(body.content, "base64").toString("utf8");
    }),
  );
  const names = Object.keys(pages).sort();
  pages["wiki/pages.txt"] = truncated
    ? `${names.join("\n")}\n…[truncated]\n`
    : `${names.join("\n")}\n`;
  return pages;
}

async function readContents(
  octokit: Octokit,
  args: { owner: string; repo: string; path: string; ref: string },
) {
  try {
    const { data } = await octokit.rest.repos.getContent(args);
    return data;
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
