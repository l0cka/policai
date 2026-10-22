/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { fakeGitHub } from "@/test/fake-github";
import { openSignalSnapshot } from "./signal-git-persist";

const TOKEN_ENV = { POLICAI_SIGNAL_GITHUB_TOKEN: "gh-token" };

const COMMIT = {
	reviewId: "rev-1",
	action: "dismiss" as const,
	message: "Approved rev-1",
	attestationText: "relayed by Policai Signal",
	changes: [{ path: "data/source-reviews.json", content: '[{"id":"rev-1"}]' }],
};

async function open(
	github: ReturnType<typeof fakeGitHub>,
	env: Record<string, string> = TOKEN_ENV,
) {
	const opened = await openSignalSnapshot({ env, fetchImpl: github.fetchImpl });
	if (!opened.ok) throw new Error(opened.error);
	return opened.snapshot;
}

describe("signal GitHub snapshot", () => {
	it("refuses before any request when the host GitHub token is missing", async () => {
		const fetchImpl = vi.fn();
		const result = await openSignalSnapshot({
			env: {},
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toMatchObject({
			ok: false,
			code: "github_token_unconfigured",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("reads files at the pinned main commit, through the blob API for large files", async () => {
		const github = fakeGitHub({
			files: { "data/small.json": "[1]\n", "data/large.json": '{"big":true}' },
			largeFiles: ["data/large.json"],
		});
		const snapshot = await open(github);
		expect(snapshot.baseSha).toBe(github.baseSha);
		expect(await snapshot.load("data/small.json")).toBe("[1]\n");
		expect(await snapshot.load("data/large.json")).toBe('{"big":true}');
		expect(await snapshot.load("data/missing.json")).toBeNull();
	});

	it("commits only the given files on top of the base tree and opens a PR", async () => {
		const github = fakeGitHub({ files: {} });
		const snapshot = await open(github);
		const result = await snapshot.commit(COMMIT);

		expect(result).toMatchObject({
			ok: true,
			target: "pr",
			branch: "signal/dismiss-rev-1",
			prUrl: "https://github.com/l0cka/policai/pull/999",
		});
		if (!result.ok) return;
		expect(github.committedFiles(result.commitSha)).toEqual({
			"data/source-reviews.json": '[{"id":"rev-1"}]',
		});
		const commit = github.commits.get(result.commitSha);
		expect(commit?.parents).toEqual([github.baseSha]);
		expect(github.trees.get(commit!.tree)?.base_tree).toBe(github.baseTree);
		expect(github.refs.get("heads/signal/dismiss-rev-1")).toBe(result.commitSha);
	});

	it("force-updates a leftover branch that has no open PR", async () => {
		const github = fakeGitHub({
			files: {},
			existingBranches: ["signal/dismiss-rev-1"],
		});
		const result = await (await open(github)).commit(COMMIT);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(github.refs.get("heads/signal/dismiss-rev-1")).toBe(result.commitSha);
		expect(
			github.requests.find(
				(r) => r.method === "PATCH" && r.path === "/git/refs/heads/signal/dismiss-rev-1",
			)?.body,
		).toEqual({ sha: result.commitSha, force: true });
	});

	it("returns an open PR for the same decision without a new commit", async () => {
		const github = fakeGitHub({
			files: {},
			openPulls: [
				{
					html_url: "https://github.com/l0cka/policai/pull/41",
					number: 41,
					head: { sha: "earlier-commit" },
				},
			],
		});
		const result = await (await open(github)).commit(COMMIT);
		expect(result).toEqual({
			ok: true,
			target: "pr",
			branch: "signal/dismiss-rev-1",
			commitSha: "earlier-commit",
			prUrl: "https://github.com/l0cka/policai/pull/41",
			htmlUrl: "https://github.com/l0cka/policai/pull/41",
			existing: true,
		});
		expect(github.requests.filter((r) => r.method !== "GET")).toEqual([]);
	});

	it("fast-forwards main without force", async () => {
		const github = fakeGitHub({ files: {} });
		const result = await (
			await open(github, { ...TOKEN_ENV, POLICAI_SIGNAL_COMMIT_TARGET: "main" })
		).commit(COMMIT);
		expect(result).toMatchObject({ ok: true, target: "main", branch: "main" });
		if (!result.ok) return;
		expect(github.refs.get("heads/main")).toBe(result.commitSha);
		expect(
			github.requests.find((r) => r.method === "PATCH")?.body,
		).toEqual({ sha: result.commitSha, force: false });
	});

	it("reports main_moved when main is no longer the base", async () => {
		const github = fakeGitHub({ files: {}, mainMovesOnPatch: true });
		const result = await (
			await open(github, { ...TOKEN_ENV, POLICAI_SIGNAL_COMMIT_TARGET: "main" })
		).commit(COMMIT);
		expect(result).toMatchObject({ ok: false, code: "main_moved" });
		expect(github.refs.get("heads/main")).toBe(github.baseSha);
	});
});
