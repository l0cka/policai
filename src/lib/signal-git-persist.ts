import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Persist Signal HTTPS mutations to GitHub so policai-pull does not wipe
 * uncommitted checkout writes. Default: open a PR for Dan to merge.
 * Optional POLICAI_SIGNAL_COMMIT_TARGET=main pushes a data commit to main
 * (Argus auto-deploys). Host-only POLICAI_SIGNAL_GITHUB_TOKEN — never the bot.
 */

export const SIGNAL_PERSIST_PATHS = [
	"data/source-reviews.json",
	"data/policies.json",
	"data/developments.json",
	"data/timeline.json",
	"public/data/meta.json",
] as const;

export type SignalCommitTarget = "pr" | "main";

export interface SignalGitPersistInput {
	reviewId: string;
	action: "approve" | "dismiss";
	message: string;
	attestationText: string;
	repoRoot?: string;
	env?: Readonly<Record<string, string | undefined>>;
	fetchImpl?: typeof fetch;
}

export type SignalGitPersistResult =
	| {
			ok: true;
			target: SignalCommitTarget;
			branch: string;
			commitSha: string;
			prUrl?: string;
			htmlUrl?: string;
	  }
	| {
			ok: false;
			code: string;
			error: string;
	  };

interface GhRef {
	object: { sha: string };
}

interface GhCommit {
	sha: string;
	tree: { sha: string };
}

interface GhBlob {
	sha: string;
}

interface GhTree {
	sha: string;
}

interface GhPull {
	html_url: string;
	number: number;
}

function commitTarget(
	env: Readonly<Record<string, string | undefined>>,
): SignalCommitTarget {
	return env.POLICAI_SIGNAL_COMMIT_TARGET?.trim() === "main" ? "main" : "pr";
}

function repoSlug(
	env: Readonly<Record<string, string | undefined>>,
): { owner: string; repo: string } {
	const raw = env.POLICAI_SIGNAL_GITHUB_REPO?.trim() || "l0cka/policai";
	const [owner, repo] = raw.split("/");
	if (!owner || !repo) {
		throw new Error("POLICAI_SIGNAL_GITHUB_REPO must be owner/repo");
	}
	return { owner, repo };
}

async function gh<T>(
	token: string,
	pathname: string,
	init: RequestInit,
	fetchImpl: typeof fetch,
): Promise<T> {
	const response = await fetchImpl(`https://api.github.com${pathname}`, {
		...init,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`GitHub ${init.method ?? "GET"} ${pathname} failed (${response.status}): ${text.slice(0, 400)}`,
		);
	}
	return text ? (JSON.parse(text) as T) : ({} as T);
}

async function readPersistedFiles(
	repoRoot: string,
): Promise<Array<{ path: string; content: string }>> {
	const files: Array<{ path: string; content: string }> = [];
	for (const relative of SIGNAL_PERSIST_PATHS) {
		const absolute = path.join(repoRoot, relative);
		try {
			const content = await readFile(absolute, "utf8");
			files.push({ path: relative, content });
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				continue;
			}
			throw error;
		}
	}
	return files;
}

export async function persistSignalDecisionToGitHub(
	input: SignalGitPersistInput,
): Promise<SignalGitPersistResult> {
	const env = input.env ?? process.env;
	const token = env.POLICAI_SIGNAL_GITHUB_TOKEN?.trim();
	if (!token) {
		return {
			ok: false,
			code: "github_token_unconfigured",
			error:
				"POLICAI_SIGNAL_GITHUB_TOKEN is not configured; Signal wrote the checkout but cannot open a PR or push to main. Set the host token, or the next policai-pull may overwrite local data.",
		};
	}

	const fetchImpl = input.fetchImpl ?? fetch;
	const target = commitTarget(env);
	const { owner, repo } = repoSlug(env);
	const repoRoot = input.repoRoot ?? process.cwd();
	const files = await readPersistedFiles(repoRoot);
	if (files.length === 0) {
		return {
			ok: false,
			code: "no_files",
			error: "No Signal persistence files found to commit",
		};
	}

	const branchName =
		target === "main"
			? "main"
			: `signal/${input.action}-${input.reviewId}`.replace(
					/[^a-zA-Z0-9._/_-]+/g,
					"-",
				);

	try {
		const mainRef = await gh<GhRef>(
			token,
			`/repos/${owner}/${repo}/git/ref/heads/main`,
			{ method: "GET" },
			fetchImpl,
		);
		const baseCommit = await gh<GhCommit>(
			token,
			`/repos/${owner}/${repo}/git/commits/${mainRef.object.sha}`,
			{ method: "GET" },
			fetchImpl,
		);

		const blobs = await Promise.all(
			files.map(async (file) => {
				const blob = await gh<GhBlob>(
					token,
					`/repos/${owner}/${repo}/git/blobs`,
					{
						method: "POST",
						body: JSON.stringify({
							content: Buffer.from(file.content, "utf8").toString("base64"),
							encoding: "base64",
						}),
					},
					fetchImpl,
				);
				return {
					path: file.path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.sha,
				};
			}),
		);

		const tree = await gh<GhTree>(
			token,
			`/repos/${owner}/${repo}/git/trees`,
			{
				method: "POST",
				body: JSON.stringify({
					base_tree: baseCommit.tree.sha,
					tree: blobs,
				}),
			},
			fetchImpl,
		);

		const commitMessage = [
			`Signal: ${input.action} ${input.reviewId}`,
			"",
			input.message,
			"",
			input.attestationText,
		].join("\n");

		const commit = await gh<GhCommit>(
			token,
			`/repos/${owner}/${repo}/git/commits`,
			{
				method: "POST",
				body: JSON.stringify({
					message: commitMessage,
					tree: tree.sha,
					parents: [mainRef.object.sha],
				}),
			},
			fetchImpl,
		);

		if (target === "main") {
			await gh(
				token,
				`/repos/${owner}/${repo}/git/refs/heads/main`,
				{
					method: "PATCH",
					body: JSON.stringify({ sha: commit.sha }),
				},
				fetchImpl,
			);
			return {
				ok: true,
				target,
				branch: "main",
				commitSha: commit.sha,
				htmlUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
			};
		}

		try {
			await gh(
				token,
				`/repos/${owner}/${repo}/git/refs`,
				{
					method: "POST",
					body: JSON.stringify({
						ref: `refs/heads/${branchName}`,
						sha: commit.sha,
					}),
				},
				fetchImpl,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!/already exists|Reference already exists/i.test(message)) {
				throw error;
			}
			await gh(
				token,
				`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
				{
					method: "PATCH",
					body: JSON.stringify({ sha: commit.sha, force: true }),
				},
				fetchImpl,
			);
		}

		const pull = await gh<GhPull>(
			token,
			`/repos/${owner}/${repo}/pulls`,
			{
				method: "POST",
				body: JSON.stringify({
					title: `Signal: ${input.action} ${input.reviewId}`,
					head: branchName,
					base: "main",
					body: [
						"## Summary",
						"",
						`Policai Signal decision: **${input.action}** \`${input.reviewId}\`.`,
						"",
						"## Attestation",
						"",
						"```",
						input.attestationText,
						"```",
						"",
						"Opened by the Signal HTTPS persistence path. Dan merges; the bot cannot merge.",
					].join("\n"),
				}),
			},
			fetchImpl,
		);

		return {
			ok: true,
			target,
			branch: branchName,
			commitSha: commit.sha,
			prUrl: pull.html_url,
			htmlUrl: pull.html_url,
		};
	} catch (error) {
		return {
			ok: false,
			code: "github_persist_failed",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
