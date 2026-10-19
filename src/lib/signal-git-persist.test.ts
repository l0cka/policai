/* @vitest-environment node */

import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { persistSignalDecisionToGitHub } from "./signal-git-persist";

describe("signal git persist", () => {
	it("refuses when the host GitHub token is missing", async () => {
		const result = await persistSignalDecisionToGitHub({
			reviewId: "rev-1",
			action: "approve",
			message: "Approved",
			attestationText: "relayed by Policai Signal",
			env: {},
		});
		expect(result).toMatchObject({
			ok: false,
			code: "github_token_unconfigured",
		});
	});

	it("opens a PR by default after building a commit from local files", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "signal-persist-"));
		await mkdir(path.join(root, "data"), { recursive: true });
		await writeFile(
			path.join(root, "data/source-reviews.json"),
			'[{"id":"rev-1"}]',
			"utf8",
		);

		const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
			const href = String(url);
			const method = init?.method ?? "GET";
			if (href.endsWith("/git/ref/heads/main") && method === "GET") {
				return new Response(JSON.stringify({ object: { sha: "mainsha" } }));
			}
			if (href.includes("/git/commits/mainsha") && method === "GET") {
				return new Response(
					JSON.stringify({ sha: "mainsha", tree: { sha: "treesha" } }),
				);
			}
			if (href.endsWith("/git/blobs") && method === "POST") {
				return new Response(JSON.stringify({ sha: "blobsha" }));
			}
			if (href.endsWith("/git/trees") && method === "POST") {
				return new Response(JSON.stringify({ sha: "newtree" }));
			}
			if (href.endsWith("/git/commits") && method === "POST") {
				return new Response(
					JSON.stringify({ sha: "commitsha", tree: { sha: "newtree" } }),
				);
			}
			if (href.endsWith("/git/refs") && method === "POST") {
				return new Response(JSON.stringify({}), { status: 201 });
			}
			if (href.endsWith("/pulls") && method === "POST") {
				return new Response(
					JSON.stringify({
						html_url: "https://github.com/l0cka/policai/pull/999",
						number: 999,
					}),
				);
			}
			return new Response(`unexpected ${method} ${href}`, { status: 500 });
		});

		const result = await persistSignalDecisionToGitHub({
			reviewId: "rev-1",
			action: "approve",
			message: "Approved rev-1",
			attestationText: "relayed by Policai Signal",
			repoRoot: root,
			env: { POLICAI_SIGNAL_GITHUB_TOKEN: "gh-token" },
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		expect(result).toEqual({
			ok: true,
			target: "pr",
			branch: "signal/approve-rev-1",
			commitSha: "commitsha",
			prUrl: "https://github.com/l0cka/policai/pull/999",
			htmlUrl: "https://github.com/l0cka/policai/pull/999",
		});
	});
});
