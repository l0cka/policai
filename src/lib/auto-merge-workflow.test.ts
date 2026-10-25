/* @vitest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
	path.join(process.cwd(), ".github/workflows/auto-merge.yml"),
	"utf8",
);

describe("auto-merge workflow", () => {
	it("keeps the default-branch gates and waits for a successful cursor-review check", () => {
		expect(workflow).toContain("pull_request_target:");
		expect(workflow).toContain("types: [opened, reopened, ready_for_review, labeled, unlabeled]");
		expect(workflow).toContain("workflow_run:");
		expect(workflow).toContain('workflows: ["Cursor review"]');
		expect(workflow).toContain("types: [requested, completed]");
		expect(workflow).not.toContain("pull_request_review:");
		expect(workflow).not.toContain("actions/checkout");
		expect(workflow).toContain("github.event.pull_request.user.login == 'l0cka'");
		expect(workflow).toContain("!github.event.pull_request.draft");
		expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
		expect(workflow).toContain("pr.user.login === 'l0cka'");
		expect(workflow).toContain("label.name === 'hold'");
		expect(workflow).toContain("check_name: 'cursor-review'");
		expect(workflow).toContain("run.conclusion === 'failure'");
		expect(workflow).toContain("run.status !== 'completed'");
		expect(workflow).toContain("run.conclusion === 'success'");
		expect(workflow).toContain("mergeMethod: SQUASH");
		expect(workflow).toContain("merge_method: 'squash'");
		expect(workflow).toContain("disablePullRequestAutoMerge");
		expect(workflow).toContain("enablePullRequestAutoMerge");
		const successGate = workflow.indexOf("if (!cursorReviewSucceeded(runs))");
		const squashNow = workflow.indexOf("mergeable_state === 'clean'");
		const enable = workflow.indexOf("enablePullRequestAutoMerge");
		expect(successGate).toBeGreaterThan(-1);
		expect(successGate).toBeLessThan(squashNow);
		expect(successGate).toBeLessThan(enable);
		const hold = workflow.indexOf("label.name === 'hold'");
		expect(hold).toBeLessThan(successGate);
	});
});
