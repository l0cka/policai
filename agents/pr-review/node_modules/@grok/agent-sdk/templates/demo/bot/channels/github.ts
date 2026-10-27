import type { SendMessageFn } from "@grok/agent-sdk";
import type { ChannelStartArgs } from "@grok/agent-sdk/channels";
import {
  type GitHubHandle,
  githubChannel,
  parseGitHubPrRef,
} from "@grok/agent-sdk/channels/github";
import { startDemo } from "../lib/collect.js";
import { REPOS } from "../lib/repos.js";

let send: SendMessageFn | undefined;

function wake(url: string, github: GitHubHandle) {
  const start = send;
  const ref = parseGitHubPrRef(url);
  if (start === undefined || ref === undefined) {
    return null;
  }
  return {
    task: async () => {
      await startDemo(start, github, ref);
    },
  };
}

export default githubChannel({
  botName: "demo-agent",
  webhookEvents: ["pull_request", "issue_comment"],
  cursorAccount: { repos: REPOS },
  deliverReplies: false,
  onStart: async (args: ChannelStartArgs) => {
    send = args.send;
  },
  onStop: async () => {
    send = undefined;
  },
  onPullRequest: async (ctx, pr) => {
    if (pr.merged || pr.action !== "labeled") {
      return null;
    }
    if (pr.label === undefined || pr.label.name !== "demo") {
      return null;
    }
    return wake(pr.url, ctx.github);
  },
  onComment: async (ctx, comment) => {
    if (ctx.conversation.kind !== "pull_request") {
      return null;
    }
    const body = comment.body.trim().toLowerCase();
    if (body !== "/demo" && !body.startsWith("/demo ")) {
      return null;
    }
    return wake(ctx.conversation.url, ctx.github);
  },
});
