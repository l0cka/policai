/* @vitest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

type Workflow = {
	jobs: { reopen: { if: string; steps: { with: { script: string } }[] } };
};

const workflow = yaml.load(
	readFileSync(
		path.join(process.cwd(), ".github/workflows/bot-pr.yml"),
		"utf8",
	),
) as Workflow;
const script = workflow.jobs.reopen.steps[0].with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {})
	.constructor as new (
	...args: string[]
) => (...args: unknown[]) => Promise<unknown>;
const run = new AsyncFunction("github", "context", "core", script);

function octokit({ createFails = false } = {}) {
	return {
		rest: {
			pulls: {
				get: vi.fn().mockResolvedValue({
					data: {
						number: 7,
						state: "open",
						title: "Fix a thing",
						body: "Why it matters.",
						draft: false,
						labels: [{ name: "hold" }],
						head: { ref: "claude/project-thread-abc" },
						base: { ref: "main" },
					},
				}),
				update: vi.fn().mockResolvedValue({}),
				create: createFails
					? vi.fn().mockRejectedValue(new Error("validation failed"))
					: vi.fn().mockResolvedValue({ data: { number: 8 } }),
				requestReviewers: vi.fn().mockResolvedValue({}),
			},
			issues: {
				addLabels: vi.fn().mockResolvedValue({}),
				addAssignees: vi.fn().mockResolvedValue({}),
				createComment: vi.fn().mockResolvedValue({}),
			},
		},
	};
}

const context = {
	repo: { owner: "l0cka", repo: "policai" },
	payload: { pull_request: { number: 7 } },
};

afterEach(() => {
	delete process.env.HAS_BOT_TOKEN;
});

describe("bot PR workflow", () => {
	it("only moves same-repo PRs opened as the maintainer account", () => {
		expect(workflow.jobs.reopen.if).toContain("user.login == 'l0cka'");
		expect(workflow.jobs.reopen.if).toContain(
			"head.repo.full_name == github.repository",
		);
	});

	it("does nothing until the bot token is configured", async () => {
		const github = octokit();
		await run(github, context, { info: vi.fn() });
		expect(github.rest.pulls.update).not.toHaveBeenCalled();
		expect(github.rest.pulls.create).not.toHaveBeenCalled();
	});

	it("closes the original and reopens it with its labels, linking both", async () => {
		process.env.HAS_BOT_TOKEN = "true";
		const github = octokit();
		await run(github, context, { info: vi.fn() });
		expect(github.rest.pulls.update).toHaveBeenCalledWith(
			expect.objectContaining({ pull_number: 7, state: "closed" }),
		);
		const created = github.rest.pulls.create.mock.calls[0][0];
		expect(created).toMatchObject({
			head: "claude/project-thread-abc",
			base: "main",
			title: "Fix a thing",
			draft: false,
		});
		expect(created.body).toContain("Why it matters.");
		expect(created.body).toContain("#7");
		expect(github.rest.issues.addLabels).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 8, labels: ["hold"] }),
		);
		expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
			expect.objectContaining({ pull_number: 8, reviewers: ["l0cka"] }),
		);
		expect(github.rest.issues.createComment.mock.calls[0][0]).toMatchObject({
			issue_number: 7,
		});
		expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain(
			"#8",
		);
	});

	it("reopens the original when the new PR cannot be created", async () => {
		process.env.HAS_BOT_TOKEN = "true";
		const github = octokit({ createFails: true });
		await expect(run(github, context, { info: vi.fn() })).rejects.toThrow(
			"validation failed",
		);
		expect(github.rest.pulls.update).toHaveBeenLastCalledWith(
			expect.objectContaining({ pull_number: 7, state: "open" }),
		);
	});
});
