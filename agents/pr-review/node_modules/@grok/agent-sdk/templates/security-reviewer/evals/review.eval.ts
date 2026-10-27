import { defineEval, includes } from "@grok/agent-sdk/evals";

const OPENED = [
  "GitHub pull request trigger: acme/api#12",
  "Action: opened",
  "PR: https://github.com/acme/api/pull/12",
  "Title: Search results",
  "Head: feat/search (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)",
  "Base: main",
  "Author: sam",
  "",
  "Read pr/diff.patch.",
].join("\n");

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "xss",
      description: "Unescaped query reflection is posted as a finding.",
      async test(t) {
        await t.send(OPENED, {
          workspaceFiles: {
            "pr/diff.patch": [
              "diff --git a/app/routes/search.ts b/app/routes/search.ts",
              "+res.send(`<h1>Results for ${req.query.q}</h1>`);",
            ].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_findings");
        t.check(t.reply, includes(/xss|cross-site|injection|finding/i));
      },
    },
    {
      id: "clean",
      description: "A docs-only change is posted as clean.",
      async test(t) {
        await t.send(OPENED.replace("Search results", "Docs"), {
          workspaceFiles: {
            "pr/diff.patch": ["diff --git a/README.md b/README.md", "+# API"].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_findings");
        t.check(t.reply, includes(/clean|no findings|no vulnerabilities/i));
      },
    },
  ],
});
