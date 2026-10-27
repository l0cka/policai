import { defineChannel, POST } from "@grok/agent-sdk/channels";
import { parseGitHubPrRef } from "@grok/agent-sdk/channels/github";
import { z } from "zod";
import { startDemo } from "../lib/collect.js";
import { watches } from "../lib/repos.js";

export default defineChannel({
  routes: [
    POST("/pr", {
      description: "Record a walkthrough for a pull request",
      bodySchema: z.object({
        pr: z.string().describe("GitHub PR URL or owner/repo#N"),
      }),
      handler: async (_req, route) => {
        const ref = parseGitHubPrRef(route.body.pr);
        if (ref === undefined || !watches(`${ref.owner}/${ref.repo}`)) {
          return new Response(null, { status: 400 });
        }
        route.waitUntil(startDemo(route.send, route.host.github, ref));
        return new Response(null, { status: 202 });
      },
    }),
  ],
});
