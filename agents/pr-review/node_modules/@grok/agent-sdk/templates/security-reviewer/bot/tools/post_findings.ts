import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGitHubPrContinuationKey } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";

const SHA = /^[0-9a-f]{40}$/i;

const finding = z.object({
  severity: z.enum(["high", "medium", "low"]),
  file: z.string().min(1).max(240),
  line: z.number().int().positive(),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(280),
});

type Finding = z.infer<typeof finding>;

export default defineTool({
  description:
    "Post the security review on this session's pull request. Call once. Empty findings = CLEAN.",
  inputSchema: z.object({
    findings: z.array(finding).describe("Exploitable issues. Empty for CLEAN."),
  }),
  async execute({ findings }, ctx) {
    if (ctx.session.purpose === "eval") {
      return { posted: false, reason: "eval" };
    }
    const ref = parseGitHubPrContinuationKey(ctx.session.continuationKey ?? "");
    if (ref === undefined) {
      throw new Error("post_findings requires a GitHub pull request session");
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
      body: reviewBody(findings),
      event: "COMMENT",
    });
    return {
      posted: true,
      pr: `${ref.owner}/${ref.repo}#${ref.number}`,
      url: response.data.html_url,
    };
  },
});

function flatten(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function reviewBody(findings: Finding[]): string {
  const verdict = findings.length === 0 ? "CLEAN" : "FINDINGS";
  const lines = ["## Security review", "", `**Verdict:** ${verdict}`];
  for (const item of findings) {
    lines.push(
      `- **${item.severity}** \`${flatten(item.file)}:${item.line}\` — ${flatten(item.title)}`,
    );
    lines.push(`  ${flatten(item.detail)}`);
  }
  return lines.join("\n");
}
