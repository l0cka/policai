import { formatGitHubOutboundComment } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { parseToken } from "../lib/collect.js";

function comment(summary: string, artifacts: string[]): string {
  const lines = ["### Demo", "", summary];
  if (artifacts.length > 0) {
    lines.push("", ...artifacts.map((path) => `- \`${path}\``));
  }
  return lines.join("\n");
}

export default defineTool({
  description: "Post the walkthrough on the current pull request. Call exactly once.",
  inputSchema: z.object({
    summary: z.string().describe("One-line walkthrough."),
    artifacts: z.array(z.string()).describe("Paths written under artifacts/. Empty if none."),
  }),
  async execute({ summary, artifacts }, ctx) {
    if (ctx.session.purpose === "eval") {
      return { posted: false, reason: "eval" };
    }
    const pr = parseToken(ctx.session.continuationKey);
    if (pr === undefined) {
      return { posted: false, error: "missing pr" };
    }
    const octokit = await ctx.host.github.getOctokit();
    await octokit.rest.issues.createComment({
      owner: pr.owner,
      repo: pr.repo,
      issue_number: pr.number,
      body: formatGitHubOutboundComment(comment(summary, artifacts)),
    });
    return { posted: true, pr: pr.label };
  },
});
