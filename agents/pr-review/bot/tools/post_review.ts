import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGitHubPrContinuationKey } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { composeReview, type PriorBlocker } from "../lib/review-body.js";

const SHA = /^[0-9a-f]{40}$/i;

const blocker = z.object({
  path: z.string().min(1).max(240),
  title: z.string().min(1).max(160),
  detail: z.string().max(500),
});

const priorItem = z.object({ id: z.string(), path: z.string(), title: z.string() });

async function readJson<T>(workspaceDir: string, file: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(workspaceDir, file), "utf8");
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export default defineTool({
  description:
    "Post this session's review. Call once. Pass new blockers in `blockers`, and the id of each earlier blocker from pr/prior-blockers.json that is still true in `stillOpen`. The tool writes one Still open line per id, fails the review when files went unread, and appends the single cursor-review marker. The review event is COMMENT.",
  effect: "write",
  inputSchema: z.object({
    blockers: z.array(blocker).describe("New blockers on this head. Empty when there are none."),
    stillOpen: z
      .array(z.string())
      .default([])
      .describe("Ids from pr/prior-blockers.json whose blocker is still true on this head."),
  }),
  async execute({ blockers, stillOpen }, ctx) {
    const prior: PriorBlocker[] = await readJson(ctx.workspaceDir, "pr/prior-blockers.json", z.array(priorItem), []);
    const unreadPaths = await readJson(ctx.workspaceDir, "pr/unread.json", z.array(z.string()), []);
    const review = composeReview(blockers, { prior, stillOpenIds: stillOpen, unreadPaths });
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
