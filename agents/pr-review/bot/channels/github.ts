import { defaultGitHubAuth, githubChannel } from "@grok/agent-sdk/channels/github";

const REPO = "l0cka/policai";
const REVIEW_ACTIONS = new Set(["opened", "synchronize"]);
const MAX_DIFF_CHARS = 150_000;

export default githubChannel({
  botName: "policai-pr-review",
  cursorAccount: { repos: [REPO], permissions: "pr-write" },
  deliverReplies: false,
  onComment: () => null,
  onPullRequest: (ctx, pr) => {
    if (ctx.repository.fullName !== REPO) return null;
    if (pr.draft || !REVIEW_ACTIONS.has(pr.action)) return null;
    return {
      auth: defaultGitHubAuth(ctx),
      title: `Review ${ctx.repository.fullName}#${pr.number}`,
      context: [
        `Review head ${pr.headSha}.`,
        "Read AGENTS.md before pr/diff.patch.",
        "Call post_review once.",
      ],
      async workspaceFiles() {
        const octokit = await ctx.github.getOctokit();
        const pull = {
          owner: ctx.repository.owner,
          repo: ctx.repository.name,
          pull_number: pr.number,
        };
        const [meta, diff, agents, reviews] = await Promise.all([
          octokit.rest.pulls.get(pull),
          octokit.rest.pulls.get({ ...pull, mediaType: { format: "diff" } }),
          octokit.rest.repos.getContent({
            owner: ctx.repository.owner,
            repo: ctx.repository.name,
            path: "AGENTS.md",
            ref: pr.headSha,
          }),
          octokit.rest.pulls.listReviews({ ...pull, per_page: 100 }),
        ]);
        const text = typeof diff.data === "string" ? diff.data : "";
        const guide = decodeContent(agents.data);
        const prior = reviews.data
          .map((review) => review.body ?? "")
          .filter((body) => body.includes("cursor-review:"));
        return {
          "AGENTS.md": guide,
          "pr/diff.patch":
            text.length > MAX_DIFF_CHARS
              ? `${text.slice(0, MAX_DIFF_CHARS)}\n…[truncated]\n`
              : text,
          "pr/head.sha": meta.data.head.sha,
          "pr/prior-reviews.json": JSON.stringify(prior),
        };
      },
    };
  },
});

function decodeContent(data: unknown): string {
  if (Array.isArray(data) || data === null || typeof data !== "object") return "";
  if (!("content" in data) || typeof data.content !== "string") return "";
  return Buffer.from(data.content, "base64").toString("utf8");
}
