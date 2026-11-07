/* @vitest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";

type Step = { with?: { script?: string } };
type Workflow = {
	on: { pull_request_target: { types: string[] } };
	jobs: { arm: { steps: Step[] } };
};

const workflow = yaml.load(
	readFileSync(
		path.join(process.cwd(), ".github/workflows/auto-merge.yml"),
		"utf8",
	),
) as Workflow;
const script = workflow.jobs.arm.steps[0].with!.script!;
const AsyncFunction = Object.getPrototypeOf(async () => {})
	.constructor as new (
	...args: string[]
) => (...args: unknown[]) => Promise<unknown>;
const run = new AsyncFunction("github", "context", "core", script);

async function arm(changedFiles: string[], { armed = false } = {}) {
	const graphql = vi.fn().mockResolvedValue({});
	const info = vi.fn();
	const octokit = {
		rest: {
			pulls: {
				get: vi.fn().mockResolvedValue({
					data: {
						number: 7,
						node_id: "PR_node",
						labels: [],
						auto_merge: armed ? { merge_method: "squash" } : null,
						mergeable_state: "blocked",
						head: { sha: "abc" },
					},
				}),
				listFiles: vi.fn(),
				merge: vi.fn(),
			},
		},
		paginate: vi
			.fn()
			.mockResolvedValue(changedFiles.map((filename) => ({ filename }))),
		graphql,
	};
	await run(
		octokit,
		{
			repo: { owner: "l0cka", repo: "policai" },
			payload: { pull_request: { number: 7 } },
		},
		{ info },
	);
	return { graphql, info };
}

describe("auto-merge workflow", () => {
	it("arms a PR that changes only collector output", async () => {
		const { graphql } = await arm([
			"data/watch-state.json",
			"public/data/meta.json",
			"data/developments.json",
		]);
		expect(graphql).toHaveBeenCalledTimes(1);
		expect(graphql.mock.calls[0][0]).toContain("enablePullRequestAutoMerge");
	});

	it("does not arm a collection-named PR that touches anything else", async () => {
		const { graphql, info } = await arm([
			"data/watch-state.json",
			".github/workflows/deploy.yml",
		]);
		expect(graphql).not.toHaveBeenCalled();
		expect(info.mock.calls.join(" ")).toContain(".github/workflows/deploy.yml");
	});

	it("does not arm when the curated register changes", async () => {
		const { graphql } = await arm(["data/policies.json"]);
		expect(graphql).not.toHaveBeenCalled();
	});

	it("re-checks the files on every push and disarms a PR that gained one", async () => {
		expect(workflow.on.pull_request_target.types).toContain("synchronize");
		const { graphql } = await arm(
			["data/watch-state.json", "src/lib/pipeline/collect.ts"],
			{ armed: true },
		);
		expect(graphql).toHaveBeenCalledTimes(1);
		expect(graphql.mock.calls[0][0]).toContain("disablePullRequestAutoMerge");
	});
});
