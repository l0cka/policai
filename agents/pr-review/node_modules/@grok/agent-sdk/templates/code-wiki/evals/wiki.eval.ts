import { defineEval } from "@grok/agent-sdk/evals";

function merged(title: string): string {
  return [
    "GitHub pull request trigger: acme/api#12",
    "Action: closed",
    "PR: https://github.com/acme/api/pull/12",
    `Title: ${title}`,
    "Head: feat/change (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)",
    "Base: main",
    "Author: sam",
    "",
    "This pull request merged. Read pr/files.txt, pr/diff.patch, and wiki/.",
  ].join("\n");
}

const INDEX = [
  "# Wiki",
  "",
  "- [Billing](billing.md): usage events posted to the warehouse",
  "- [App](app.md): HTTP handlers and UI chrome",
  "",
].join("\n");

const BILLING = [
  "# Billing",
  "",
  "Usage events are protobuf messages in `proto/billing.proto`.",
  "Each event has `account_id` and `amount_cents`.",
  "",
].join("\n");

const APP = ["# App", "", "The sidebar opener is a querySelector on `.opener`.", ""].join("\n");

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "skip-lint",
      description: "A quote-style lint fix does not open a wiki PR.",
      async test(t) {
        await t.send(merged("Fix sidebar opener lint failure"), {
          workspaceFiles: {
            "pr/files.txt": "src/sidebar.ts\n",
            "pr/diff.patch": [
              "diff --git a/src/sidebar.ts b/src/sidebar.ts",
              "-const opener = document.querySelector('.opener')",
              '+const opener = document.querySelector(".opener");',
            ].join("\n"),
            "wiki/pages.txt": "wiki/_index.md\nwiki/app.md\n",
            "wiki/_index.md": INDEX,
            "wiki/app.md": APP,
          },
        });
        t.succeeded();
        t.calledTool("apply_wiki", { input: { verdict: "skip" } });
      },
    },
    {
      id: "update-contract",
      description: "New billing proto fields update the billing page.",
      async test(t) {
        await t.send(merged("Add unified fields to billing events"), {
          workspaceFiles: {
            "pr/files.txt": "proto/billing.proto\n",
            "pr/diff.patch": [
              "diff --git a/proto/billing.proto b/proto/billing.proto",
              " message UsageEvent {",
              "   string account_id = 1;",
              "   int64 amount_cents = 2;",
              "+  string usage_unit = 12;",
              "+  string workspace_id = 13;",
              " }",
            ].join("\n"),
            "wiki/pages.txt": "wiki/_index.md\nwiki/billing.md\n",
            "wiki/_index.md": INDEX,
            "wiki/billing.md": BILLING,
          },
        });
        t.succeeded();
        t.calledTool("apply_wiki", { input: { verdict: "update" } });
      },
    },
    {
      id: "skip-docs",
      description: "A markdown-only merge does not open a wiki PR.",
      async test(t) {
        await t.send(merged("Document factory delete in servicetests"), {
          workspaceFiles: {
            "pr/files.txt": "docs/factory/README.md\n",
            "pr/diff.patch": [
              "diff --git a/docs/factory/README.md b/docs/factory/README.md",
              "+Drive environment delete from markdown servicetests.",
            ].join("\n"),
            "wiki/pages.txt": "wiki/_index.md\n",
            "wiki/_index.md": INDEX,
          },
        });
        t.succeeded();
        t.calledTool("apply_wiki", { input: { verdict: "skip" } });
      },
    },
    {
      id: "skip-cherry-pick",
      description: "A release-train cherry-pick does not open a wiki PR.",
      async test(t) {
        await t.send(merged("[CP releases/3.19] Stop stale Project corner loaders"), {
          workspaceFiles: {
            "pr/files.txt": "src/projects.ts\n",
            "pr/diff.patch": [
              "diff --git a/src/projects.ts b/src/projects.ts",
              "+if (status.seq < last.seq) return;",
            ].join("\n"),
            "wiki/pages.txt": "wiki/_index.md\nwiki/app.md\n",
            "wiki/_index.md": INDEX,
            "wiki/app.md": APP,
          },
        });
        t.succeeded();
        t.calledTool("apply_wiki", { input: { verdict: "skip" } });
      },
    },
  ],
});
