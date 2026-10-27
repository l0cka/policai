import { defaultGitHubPullRequestDispatch, githubChannel } from "@grok/agent-sdk/channels/github";
import { REPOS, watches } from "../lib/repos.js";

const MAX_DIFF_CHARS = 150_000;

export default githubChannel({
  cursorAccount: { repos: REPOS },
  deliverReplies: false,
  onComment: () => null,
  onPullRequest: (ctx, pr) => {
    if (!watches(ctx.repository.fullName) || pr.draft) {
      return null;
    }
    const dispatch = defaultGitHubPullRequestDispatch(ctx, pr);
    if (dispatch === null) {
      return null;
    }
    return {
      auth: dispatch.auth,
      context: ["Read pr/diff.patch."],
      async workspaceFiles() {
        const octokit = await ctx.github.getOctokit();
        const pull = {
          owner: ctx.repository.owner,
          repo: ctx.repository.name,
          pull_number: pr.number,
        };
        const [meta, diff] = await Promise.all([
          octokit.rest.pulls.get(pull),
          octokit.rest.pulls.get({ ...pull, mediaType: { format: "diff" } }),
        ]);
        const text = typeof diff.data === "string" ? diff.data : "";
        return {
          "pr/diff.patch":
            text.length > MAX_DIFF_CHARS
              ? `${text.slice(0, MAX_DIFF_CHARS)}\n…[truncated]\n`
              : text,
          "pr/head.sha": meta.data.head.sha,
        };
      },
    };
  },
});
