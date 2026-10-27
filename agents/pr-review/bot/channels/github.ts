import { defaultGitHubAuth, githubChannel } from "@grok/agent-sdk/channels/github";
import { fitDiff } from "../lib/diff.js";
import { priorBlockers } from "../lib/review-body.js";

const REPO = "l0cka/policai";
// The stamp workflow opens a waiting `cursor-review` check on each of these.
const REVIEW_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);
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
          octokit.paginate(octokit.rest.pulls.listReviews, { ...pull, per_page: 100 }),
        ]);
        const text = typeof diff.data === "string" ? diff.data : "";
        const guide = decodeContent(agents.data);
        const prior = reviews
          .map((review) => review.body ?? "")
          .filter((body) => body.includes("cursor-review:"));
        // Only an app can be this agent, so a pasted signature from a person is ignored.
        const fromBots = reviews
          .filter((review) => review.user?.type === "Bot")
          .map((review) => review.body ?? "");
        const fitted = fitDiff(text, MAX_DIFF_CHARS);
        return {
          "AGENTS.md": guide,
          "pr/diff.patch": fitted.patch,
          "pr/unread.json": JSON.stringify(fitted.unread),
          "pr/head.sha": meta.data.head.sha,
          "pr/prior-reviews.json": JSON.stringify(prior),
          "pr/prior-blockers.json": JSON.stringify(priorBlockers(fromBots)),
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
