import { defineEval, includes } from "@grok/agent-sdk/evals";
import { type Collected, filesFor, promptFor } from "../bot/lib/collect.js";

const pr: Collected = {
  owner: "acme",
  repo: "shop",
  number: 42,
  url: "https://github.com/acme/shop/pull/42",
  label: "acme/shop#42",
  title: "Add CSV export to orders",
  body: "Adds an Export CSV button on the orders page. Click Orders, then Export.",
  files: ["src/orders/export.ts", "src/orders/page.tsx"],
};

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "export",
      description: "A seeded PR walkthrough is recorded.",
      async test(t) {
        await t.send(promptFor(pr), { workspaceFiles: filesFor(pr) });
        t.succeeded();
        t.calledTool("record_demo");
        t.check(t.reply, includes(/export|csv/i));
      },
    },
  ],
});
