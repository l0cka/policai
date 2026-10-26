import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGitHubPrContinuationKey } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { composeReview } from "../lib/review-body.js";

const SHA = /^[0-9a-f]{40}$/i;

const blocker = z.object({
  path: z.string().min(1).max(240),
  title: z.string().min(1).max(160),
  detail: z.string().max(500),
});

async function priorBodies(workspaceDir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(workspaceDir, "pr/prior-reviews.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export default defineTool({
  description:
    "Post this session's review. Call once. Pass every current blocker, including one that repeats an earlier review. The tool drops repeats, writes one Still open line for each unfixed earlier blocker, and appends the single cursor-review marker. The review event is COMMENT.",
  effect: "write",
  inputSchema: z.object({
    blockers: z.array(blocker).describe("Current blockers. Empty when the head has none."),
  }),
  async execute({ blockers }, ctx) {
    const review = composeReview(blockers, await priorBodies(ctx.workspaceDir));
    const result = {
      posted: false,
      event: review.event,
      conclusion: review.conclusion,
      body: review.body,
      dropped: review.dropped,
      stillOpen: review.stillOpen,
    };
    if (ctx.session.purpose === "eval") {
      return { ...result, reason: "eval" };
    }
    const ref = parseGitHubPrContinuationKey(ctx.session.continuationKey ?? "");
    if (ref === undefined) {
      return { ...result, reason: "no-pr-session" };
    }
    const headSha = (await readFile(join(ctx.workspaceDir, "pr/head.sha"), "utf8")).trim();
    if (!SHA.test(headSha)) {
      throw new Error("missing pr/head.sha");
    }
    const octokit = await ctx.host.github.getOctokit();
    const response = await octokit.rest.pulls.createReview({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: ref.number,
      commit_id: headSha,
      body: review.body,
      event: review.event,
    });
    return { ...result, posted: true, url: response.data.html_url };
  },
});
