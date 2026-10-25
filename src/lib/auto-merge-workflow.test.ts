/* @vitest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const workflow = readFileSync(
	path.join(process.cwd(), ".github/workflows/auto-merge.yml"),
	"utf8",
);

function scriptBody(): string {
	const marker = "script: |\n";
	const start = workflow.indexOf(marker);
	expect(start).toBeGreaterThan(-1);
	return workflow
		.slice(start + marker.length)
		.split("\n")
		.map((line) => (line.startsWith("            ") ? line.slice(12) : line))
		.join("\n");
}

const repo = { owner: "l0cka", repo: "policai" };
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAIN = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function pull(overrides: Record<string, unknown> = {}) {
	return {
		number: 543,
		node_id: "PR_NODE",
		state: "open",
		draft: false,
		mergeable_state: "clean",
		auto_merge: null,
		user: { login: "l0cka" },
		base: { ref: "main" },
		head: {
			sha: HEAD,
			repo: { full_name: "l0cka/policai" },
		},
		labels: [] as { name: string }[],
		...overrides,
	};
}

function successRun() {
	return { name: "cursor-review", status: "completed", conclusion: "success" };
}

type Harness = {
	merge: ReturnType<typeof vi.fn>;
	graphql: ReturnType<typeof vi.fn>;
	logs: string[];
};

function harness(context: Record<string, unknown>, pulls: Record<string, unknown>[]): Harness {
	const merge = vi.fn();
	const graphql = vi.fn();
	const logs: string[] = [];
	let read = 0;
	const github = {
		rest: {
			pulls: {
				get: vi.fn(async () => {
					const data = pulls[Math.min(read, pulls.length - 1)];
					read += 1;
					return { data };
				}),
				list: vi.fn(async () => ({ data: [{ number: 543, state: "open" }] })),
				merge,
			},
			repos: {
				listPullRequestsAssociatedWithCommit: vi.fn(async () => ({ data: [] })),
			},
			checks: {
				listForRef: vi.fn(async () => ({ check_runs: [] })),
			},
		},
		graphql,
	};
	const core = { info: (message: string) => logs.push(message) };
	const run = new Function(
		"github",
		"context",
		"core",
		`return (async () => {\n${scriptBody()}\n})();`,
	) as (github: unknown, context: unknown, core: unknown) => Promise<void>;
	return { merge, graphql, logs, github, run, context: { repo, ...context } } as Harness & {
		github: typeof github;
		run: typeof run;
		context: unknown;
	};
}

async function execute(context: Record<string, unknown>, options: {
	pulls: Record<string, unknown>[];
	checks?: Record<string, unknown>[];
	list?: Record<string, unknown>[];
	associated?: Record<string, unknown>[];
}) {
	const box = harness(context, options.pulls);
	const github = (box as unknown as { github: {
		rest: {
			checks: { listForRef: ReturnType<typeof vi.fn> };
			pulls: { list: ReturnType<typeof vi.fn> };
			repos: { listPullRequestsAssociatedWithCommit: ReturnType<typeof vi.fn> };
		};
	} }).github;
	github.rest.checks.listForRef.mockResolvedValue({
		data: { check_runs: options.checks ?? [successRun()] },
	});
	if (options.list) github.rest.pulls.list.mockResolvedValue({ data: options.list });
	if (options.associated) {
		github.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValue({
			data: options.associated,
		});
	}
	await (box as unknown as { run: (g: unknown, c: unknown, core: unknown) => Promise<void> }).run(
		github,
		(box as unknown as { context: unknown }).context,
		{ info: (message: string) => box.logs.push(message) },
	);
	return box;
}

function workflowRun(action: string, headSha: string, headBranch = "topic") {
	return {
		eventName: "workflow_run",
		payload: {
			action,
			workflow_run: {
				head_sha: headSha,
				head_branch: headBranch,
				pull_requests: [] as { number: number }[],
				head_repository: { owner: { login: "l0cka" } },
			},
		},
	};
}

describe("auto-merge workflow", () => {
	it("queues hold and workflow_run on the same head SHA", () => {
		const group = workflow.match(/^ {2}group: (.+)$/m)?.[1];
		expect(group).toBe(
			"auto-merge-${{ github.event.pull_request.head.sha }}${{ github.event.workflow_run.head_sha }}",
		);
		const key = (event: { pull_request?: { head?: { sha?: string } }; workflow_run?: { head_sha?: string } }) =>
			`auto-merge-${event.pull_request?.head?.sha ?? ""}${event.workflow_run?.head_sha ?? ""}`;
		expect(key({ pull_request: { head: { sha: HEAD } } })).toBe(key({ workflow_run: { head_sha: HEAD } }));
		expect(key({ pull_request: { head: { sha: HEAD } } })).not.toBe(
			`auto-merge-543`,
		);
	});

	it("does not squash a stale read after hold is on the PR", async () => {
		const seen = pull();
		const held = pull({ labels: [{ name: "hold" }], auto_merge: { enabled_by: { login: "l0cka" } } });
		const box = await execute(workflowRun("completed", HEAD), {
			pulls: [seen, seen, held],
		});
		expect(box.merge).not.toHaveBeenCalled();
		expect(box.graphql).toHaveBeenCalledWith(
			expect.stringContaining("disablePullRequestAutoMerge"),
			{ id: "PR_NODE" },
		);
		expect(box.graphql).not.toHaveBeenCalledWith(
			expect.stringContaining("enablePullRequestAutoMerge"),
			expect.anything(),
		);
	});

	it("skips a PR associated with the default-branch commit", async () => {
		const other = pull({ number: 12, head: { sha: HEAD, repo: { full_name: "l0cka/policai" } } });
		const box = await execute(workflowRun("completed", MAIN, "main"), {
			pulls: [other],
			list: [],
			associated: [{ number: 12, state: "open" }],
		});
		expect(box.merge).not.toHaveBeenCalled();
		expect(box.graphql).not.toHaveBeenCalled();
		expect(box.logs.some((line) => line.includes("is not the Cursor review SHA"))).toBe(true);
	});

	it("does not squash on workflow_run requested when a success already exists", async () => {
		const armed = pull({ auto_merge: { enabled_by: { login: "l0cka" } } });
		const box = await execute(workflowRun("requested", HEAD), { pulls: [armed, armed] });
		expect(box.merge).not.toHaveBeenCalled();
		expect(box.graphql).toHaveBeenCalledWith(
			expect.stringContaining("disablePullRequestAutoMerge"),
			{ id: "PR_NODE" },
		);
		expect(box.graphql).not.toHaveBeenCalledWith(
			expect.stringContaining("enablePullRequestAutoMerge"),
			expect.anything(),
		);
	});

	it("squash-merges on workflow_run completed when the head check succeeded", async () => {
		const ready = pull();
		const box = await execute(workflowRun("completed", HEAD), { pulls: [ready, ready, ready] });
		expect(box.merge).toHaveBeenCalledWith(expect.objectContaining({
			pull_number: 543,
			sha: HEAD,
			merge_method: "squash",
		}));
	});

	it("leaves auto-merge off when the check failed", async () => {
		const armed = pull({ auto_merge: { enabled_by: { login: "l0cka" } } });
		const box = await execute(workflowRun("completed", HEAD), {
			pulls: [armed, armed],
			checks: [{ name: "cursor-review", status: "completed", conclusion: "failure" }],
		});
		expect(box.merge).not.toHaveBeenCalled();
		expect(box.graphql).toHaveBeenCalledWith(
			expect.stringContaining("disablePullRequestAutoMerge"),
			{ id: "PR_NODE" },
		);
	});
});
