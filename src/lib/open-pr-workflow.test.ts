/* @vitest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

type Workflow = {
	on: { workflow_dispatch: { inputs: Record<string, unknown> } };
	jobs: { open: { steps: { with: { script: string; "github-token": string } }[] } };
};

const workflow = yaml.load(
	readFileSync(
		path.join(process.cwd(), ".github/workflows/open-pr.yml"),
		"utf8",
	),
) as Workflow;
const step = workflow.jobs.open.steps[0];
const AsyncFunction = Object.getPrototypeOf(async () => {})
	.constructor as new (
	...args: string[]
) => (...args: unknown[]) => Promise<unknown>;
const run = new AsyncFunction("github", "context", "core", step.with.script);

const context = { repo: { owner: "l0cka", repo: "policai" } };

function octokit(existing: { number: number }[] = []) {
	const pr = { number: 9, html_url: "https://github.com/l0cka/policai/pull/9" };
	return {
		paginate: vi.fn().mockResolvedValue(existing),
		rest: {
			repos: { getBranch: vi.fn().mockResolvedValue({}) },
			pulls: {
				list: vi.fn(),
				create: vi.fn().mockResolvedValue({ data: pr }),
				update: vi.fn().mockResolvedValue({ data: { ...pr, number: existing[0]?.number } }),
				requestReviewers: vi.fn().mockResolvedValue({}),
			},
			issues: {
				addLabels: vi.fn().mockResolvedValue({}),
				addAssignees: vi.fn().mockResolvedValue({}),
			},
		},
	};
}

function core() {
	const summary = { addRaw: vi.fn(), write: vi.fn().mockResolvedValue(undefined) };
	summary.addRaw.mockReturnValue(summary);
	return { info: vi.fn(), summary };
}

function inputs(values: Record<string, string>) {
	Object.assign(process.env, {
		HEAD: "claude/project-thread-abc",
		TITLE: "Fix a thing",
		BODY: "Why it matters.",
		DRAFT: "false",
		HOLD: "false",
		...values,
	});
}

afterEach(() => {
	for (const key of ["HEAD", "TITLE", "BODY", "DRAFT", "HOLD"]) delete process.env[key];
});

describe("open PR workflow", () => {
	it("runs with the bot's token, so the maintainer is never the author", () => {
		expect(step.with["github-token"]).toBe("${{ secrets.POLICAI_BOT_TOKEN }}");
		expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(
			expect.arrayContaining(["head", "title", "body", "draft", "hold"]),
		);
	});

	it("opens a PR and asks the maintainer to review it", async () => {
		inputs({});
		const github = octokit();
		await run(github, context, core());
		expect(github.rest.pulls.create).toHaveBeenCalledWith(
			expect.objectContaining({
				head: "claude/project-thread-abc",
				base: "main",
				title: "Fix a thing",
				body: "Why it matters.",
				draft: false,
			}),
		);
		expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
			expect.objectContaining({ pull_number: 9, reviewers: ["l0cka"] }),
		);
		expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
	});

	it("updates the open PR for the branch instead of opening a second", async () => {
		inputs({ TITLE: "Fix a thing, take two" });
		const github = octokit([{ number: 4 }]);
		await run(github, context, core());
		expect(github.rest.pulls.create).not.toHaveBeenCalled();
		expect(github.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({ pull_number: 4, title: "Fix a thing, take two" }),
		);
	});

	it("labels a held PR", async () => {
		inputs({ HOLD: "true" });
		const github = octokit();
		await run(github, context, core());
		expect(github.rest.issues.addLabels).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 9, labels: ["hold"] }),
		);
	});

	it("refuses main as the head branch", async () => {
		inputs({ HEAD: "main" });
		const github = octokit();
		await expect(run(github, context, core())).rejects.toThrow("head must be");
		expect(github.rest.pulls.create).not.toHaveBeenCalled();
	});
});
