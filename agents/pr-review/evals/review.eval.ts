import { defineEval } from "@grok/agent-sdk/evals";

const AGENTS = [
  "# AGENTS.md",
  "Public pages read verified records only.",
  "A withheld record must not appear in a public API response.",
].join("\n");

function opened(title: string): string {
  return [
    "Review head aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.",
    "Read AGENTS.md before pr/diff.patch.",
    "Call post_review once.",
    `Title: ${title}`,
  ].join("\n");
}

const PRIOR_FAILURE = [
  "Blocking.",
  "",
  "- `src/app/api/policies/route.ts`: Public route returns withheld records. getPolicies is not applied.",
  "",
  "<!-- cursor-review: failure -->",
].join("\n");

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "clean",
      description: "A comment-only change is success, with no notes section.",
      async test(t) {
        await t.send(opened("Comment a helper"), {
          workspaceFiles: {
            "AGENTS.md": AGENTS,
            "pr/head.sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
            "pr/prior-reviews.json": "[]",
            "pr/diff.patch": [
              "diff --git a/src/lib/labels.ts b/src/lib/labels.ts",
              "--- a/src/lib/labels.ts",
              "+++ b/src/lib/labels.ts",
              "@@ -1,2 +1,2 @@",
              "-// jurisdiction label",
              "+// Jurisdiction label for the register.",
            ].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_review", {
          count: 1,
          output: (value) => {
            const review = value as { conclusion?: string; body?: string; event?: string };
            return review.conclusion === "success"
              && review.event === "COMMENT"
              && review.body === "No blocking issues.\n\n<!-- cursor-review: success -->";
          },
        });
      },
    },
    {
      id: "blocker",
      description: "A withheld record leaking to the public API is failure.",
      async test(t) {
        await t.send(opened("Serve every policy"), {
          workspaceFiles: {
            "AGENTS.md": AGENTS,
            "pr/head.sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
            "pr/prior-reviews.json": "[]",
            "pr/diff.patch": [
              "diff --git a/src/app/api/policies/route.ts b/src/app/api/policies/route.ts",
              "--- a/src/app/api/policies/route.ts",
              "+++ b/src/app/api/policies/route.ts",
              "@@ -1,3 +1,3 @@",
              "-import { getPolicies } from \"@/lib/data-service\";",
              "-const policies = await getPolicies();",
              "+const policies = await readEveryPolicyIncludingWithheld();",
              "+return Response.json(policies);",
            ].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_review", {
          count: 1,
          output: (value) => {
            const review = value as { conclusion?: string; body?: string; event?: string };
            const markers = review.body?.match(/<!-- cursor-review: (success|failure) -->/g) ?? [];
            return review.conclusion === "failure"
              && review.event === "COMMENT"
              && markers.length === 1
              && markers[0] === "<!-- cursor-review: failure -->"
              && !review.body?.includes("## Notes")
              && !review.body?.includes("\nNotes\n");
          },
        });
      },
    },
    {
      id: "rereview-fixed",
      description: "A fixed blocker is not repeated and the marker is success.",
      async test(t) {
        await t.send(opened("Use the public policy read"), {
          workspaceFiles: {
            "AGENTS.md": AGENTS,
            "pr/head.sha": "cccccccccccccccccccccccccccccccccccccccc\n",
            "pr/prior-reviews.json": JSON.stringify([PRIOR_FAILURE]),
            "pr/diff.patch": [
              "diff --git a/src/app/api/policies/route.ts b/src/app/api/policies/route.ts",
              "--- a/src/app/api/policies/route.ts",
              "+++ b/src/app/api/policies/route.ts",
              "@@ -1,3 +1,3 @@",
              "-const policies = await readEveryPolicyIncludingWithheld();",
              "+import { getPolicies } from \"@/lib/data-service\";",
              "+const policies = await getPolicies();",
            ].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_review", {
          count: 1,
          output: (value) => {
            const review = value as { conclusion?: string; body?: string };
            return review.conclusion === "success"
              && review.body?.includes("Still open") === false
              && review.body?.includes("Public route returns withheld") === false
              && review.body?.endsWith("<!-- cursor-review: success -->") === true;
          },
        });
      },
    },
    {
      id: "rereview-still-open",
      description: "An unfixed blocker is one Still open line, not a repeat.",
      async test(t) {
        await t.send(opened("Leave the public route unchanged"), {
          workspaceFiles: {
            "AGENTS.md": AGENTS,
            "pr/head.sha": "dddddddddddddddddddddddddddddddddddddddd\n",
            "pr/prior-reviews.json": JSON.stringify([PRIOR_FAILURE]),
            "pr/diff.patch": [
              "diff --git a/src/app/api/policies/route.ts b/src/app/api/policies/route.ts",
              "@@ -1,2 +1,3 @@",
              " const policies = await readEveryPolicyIncludingWithheld();",
              "+// still returns withheld records",
              " return Response.json(policies);",
            ].join("\n"),
          },
        });
        t.succeeded();
        t.calledTool("post_review", {
          count: 1,
          output: (value) => {
            const review = value as { conclusion?: string; body?: string };
            const stillOpen = review.body?.match(/Still open:/g) ?? [];
            const markers = review.body?.match(/<!-- cursor-review: (success|failure) -->/g) ?? [];
            return review.conclusion === "failure"
              && stillOpen.length === 1
              && review.body?.includes("Still open: `src/app/api/policies/route.ts` Public route returns withheld records") === true
              && review.body?.includes("getPolicies is not applied") === false
              && markers.length === 1;
          },
        });
      },
    },
  ],
});
